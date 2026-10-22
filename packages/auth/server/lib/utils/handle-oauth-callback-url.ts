import { formatPath, NEXT_PUBLIC_WEBAPP_URL } from '@e-sign/lib/constants/app';
import {
  isDisposableEmail,
  isEmailDomainAllowedForSignup,
  isSignupEnabledForProvider,
} from '@e-sign/lib/constants/auth';
import { formatEmbedAuthCompletePageUrl } from '@e-sign/lib/constants/embed-auth';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { getEmailBlocklistDomains } from '@e-sign/lib/server-only/site-settings/get-email-blocklist-domains';
import { onCreateUserHook } from '@e-sign/lib/server-only/user/create-user';
import { deletedServiceAccountEmail } from '@e-sign/lib/server-only/user/service-accounts/deleted-account';
import { legacyServiceAccountEmail } from '@e-sign/lib/server-only/user/service-accounts/legacy-service-account';
import { isValidReturnTo, normalizeReturnTo } from '@e-sign/lib/utils/is-valid-return-to';
import { logger } from '@e-sign/lib/utils/logger';
import { prisma } from '@e-sign/prisma';
import { UserSecurityAuditLogType } from '@prisma/client';
import { callPramaan } from '@e-sign/lib/server-only/pramaan';
import type { Context } from 'hono';
import { deleteCookie } from 'hono/cookie';

import type { OAuthClientOptions } from '../../config';
import { AuthenticationErrorCode } from '../errors/error-codes';
import { failEmbedAuthFlow } from '../handoff/record-embed-auth-failure';
import { onAuthorize } from './authorizer';


type HandleOAuthCallbackUrlOptions = {
  c: Context;
  clientOptions: OAuthClientOptions;
};

const redirectToSignInError = async (c: Context, errorCode: string) => {
  const isEmbedFlow = await failEmbedAuthFlow(c, c.req.query('state'), errorCode);

  if (isEmbedFlow) {
    return c.redirect(formatEmbedAuthCompletePageUrl('error'), 302);
  }

  const errorUrl = new URL(formatPath('/signin'), NEXT_PUBLIC_WEBAPP_URL());

  errorUrl.searchParams.set('error', errorCode);

  return c.redirect(errorUrl.toString(), 302);
};

export const handleOAuthCallbackUrl = async (options: HandleOAuthCallbackUrlOptions) => {
  const { c } = options;

  try {
    return await handleOAuthCallback(options);
  } catch (err) {
    const reason = err instanceof AppError ? err.code : AppErrorCode.UNKNOWN_ERROR;

    const isEmbedFlow = await failEmbedAuthFlow(c, c.req.query('state'), reason);

    if (!isEmbedFlow) {
      throw err;
    }

    logger.error({
      event: 'auth.embed.oauth_callback_failed',
      error: err,
    });

    return c.redirect(formatEmbedAuthCompletePageUrl('error'), 302);
  }
};

const handleOAuthCallback = async (options: HandleOAuthCallbackUrlOptions) => {
  const { c, clientOptions } = options;

  const requestMeta = c.get('requestMetadata');

  const { email, name, sub, accessToken, accessTokenExpiresAt, idToken, redirectPath } = await validateOauth({
    c,
    clientOptions,
  });

  if (email.toLowerCase() === legacyServiceAccountEmail() || email.toLowerCase() === deletedServiceAccountEmail()) {
    const isEmbedFlow = await failEmbedAuthFlow(c, c.req.query('state'), 'service_account');

    if (isEmbedFlow) {
      return c.redirect(formatEmbedAuthCompletePageUrl('error'), 302);
    }

    return c.text('FORBIDDEN', 403);
  }

  // Find the account if possible.
  const existingAccount = await prisma.account.findFirst({
    where: {
      provider: clientOptions.id,
      providerAccountId: sub,
    },
    include: {
      user: {
        select: {
          id: true,
        },
      },
    },
  });

  // Directly log in user if account already exists.
  if (existingAccount) {
    await onAuthorize({ userId: existingAccount.user.id }, c);

    return c.redirect(redirectPath, 302);
  }

  const userWithSameEmail = await prisma.user.findFirst({
    where: {
      email: email,
    },
    select: {
      id: true,
      emailVerified: true,
    },
  });

  // Handle existing user but no account.
  if (userWithSameEmail) {
    await prisma.$transaction(async (tx) => {
      await tx.account.create({
        data: {
          type: 'oauth',
          provider: clientOptions.id,
          providerAccountId: sub,
          access_token: accessToken,
          expires_at: Math.floor(accessTokenExpiresAt.getTime() / 1000),
          token_type: 'Bearer',
          id_token: idToken,
          userId: userWithSameEmail.id,
        },
      });

      // Log link event.
      await tx.userSecurityAuditLog.create({
        data: {
          userId: userWithSameEmail.id,
          ipAddress: requestMeta.ipAddress,
          userAgent: requestMeta.userAgent,
          type: UserSecurityAuditLogType.ACCOUNT_SSO_LINK,
        },
      });

      // If account already exists in an unverified state, remove the password to ensure
      // they cannot sign in since we cannot confirm the password was set by the user.
      if (!userWithSameEmail.emailVerified) {
        await tx.user.update({
          where: {
            id: userWithSameEmail.id,
          },
          data: {
            emailVerified: new Date(),
            password: null,
            // Todo: (RR7) Will need to update the "password" account after the migration.
          },
        });
      }
    });

    await onAuthorize({ userId: userWithSameEmail.id }, c);

    return c.redirect(redirectPath, 302);
  }

  // Check if signups are disabled for this provider.
  if (!isSignupEnabledForProvider(clientOptions.id as 'google' | 'microsoft' | 'oidc')) {
    return redirectToSignInError(c, AuthenticationErrorCode.SignupDisabled);
  }

  // Check domain restriction for new SSO users.
  if (!isEmailDomainAllowedForSignup(email)) {
    return redirectToSignInError(c, AuthenticationErrorCode.SignupDisabled);
  }

  // Reject disposable / throwaway email providers for new SSO users.
  const additionalBlockedDomains = await getEmailBlocklistDomains();

  if (isDisposableEmail(email, additionalBlockedDomains)) {
    return redirectToSignInError(c, AuthenticationErrorCode.SignupDisposableEmail);
  }

  // Handle new user.
  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: email,
        name: name,
        emailVerified: new Date(),
      },
    });

    await tx.account.create({
      data: {
        type: 'oauth',
        provider: clientOptions.id,
        providerAccountId: sub,
        access_token: accessToken,
        expires_at: Math.floor(accessTokenExpiresAt.getTime() / 1000),
        token_type: 'Bearer',
        id_token: idToken,
        userId: user.id,
      },
    });

    return user;
  });

  await onCreateUserHook(createdUser).catch((err) => {
    // Todo: (RR7) Add logging.
    console.error(err);
  });

  await onAuthorize({ userId: createdUser.id }, c);

  return c.redirect(redirectPath, 302);
};

export const validateOauth = async (options: HandleOAuthCallbackUrlOptions) => {
  const { c, clientOptions } = options;

  if (!clientOptions.clientId || !clientOptions.clientSecret) {
    throw new AppError(AppErrorCode.NOT_SETUP);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');

  const storedState = deleteCookie(c, `${clientOptions.id}_oauth_state`);
  const storedCodeVerifier = deleteCookie(c, `${clientOptions.id}_code_verifier`);
  const storedRedirectPath = deleteCookie(c, `${clientOptions.id}_redirect_path`) ?? '';

  if (!code || !storedState || state !== storedState || !storedCodeVerifier) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Invalid or missing state',
    });
  }

  // eslint-disable-next-line prefer-const
  let [redirectState, redirectPath] = storedRedirectPath.split(' ');

  // The sub-path aware root, e.g. "/" or "/ESign/".
  const defaultRedirectPath = formatPath('/');

  if (redirectState !== storedState || !redirectPath) {
    redirectPath = defaultRedirectPath;
  }

  if (!isValidReturnTo(redirectPath)) {
    redirectPath = defaultRedirectPath;
  }

  redirectPath = normalizeReturnTo(redirectPath) || defaultRedirectPath;

  if (clientOptions.id !== 'google' && clientOptions.id !== 'microsoft') {
    throw new AppError(AppErrorCode.NOT_SETUP, { message: 'External organisation sign-in is unavailable.' });
  }
  const identity = await callPramaan('auth.social.exchange', {
    providerKey: clientOptions.id === 'google' ? 'google-identity' : 'microsoft-identity',
    code, redirectUri: clientOptions.redirectUrl, pkceVerifier: storedCodeVerifier,
  });
  if (!identity.email || !identity.emailVerified) throw new AppError(AuthenticationErrorCode.UnverifiedEmail, { message: 'Use an account with a verified email.' });
  const email = identity.email;
  const name = identity.displayName || email;
  const sub = identity.subjectId;
  const accessToken = null;
  const idToken = null;
  const accessTokenExpiresAt = new Date(0);

  return {
    email,
    name,
    sub,
    accessToken,
    accessTokenExpiresAt,
    idToken,
    redirectPath,
  };
};
