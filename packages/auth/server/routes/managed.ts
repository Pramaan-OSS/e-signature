import { createHash, randomBytes } from 'node:crypto';
import { NEXT_PUBLIC_WEBAPP_URL } from '@e-sign/lib/constants/app';
import {
  formatHostCookieName,
  isDisposableEmail,
  isEmailDomainAllowedForSignup,
  isSigninEnabledForProvider,
  isSignupEnabledForProvider,
  shouldUseSecureCookies,
} from '@e-sign/lib/constants/auth';
import { jobsClient } from '@e-sign/lib/jobs/client';
import { getManagedBackend, verifyManagedToken } from '@e-sign/lib/server-only/pramaan/managed-auth';
import { rateLimitResponse } from '@e-sign/lib/server-only/rate-limit/rate-limit-middleware';
import { loginRateLimit } from '@e-sign/lib/server-only/rate-limit/rate-limits';
import { getEmailBlocklistDomains } from '@e-sign/lib/server-only/site-settings/get-email-blocklist-domains';
import { onCreateUserHook } from '@e-sign/lib/server-only/user/create-user';
import { isValidReturnTo, normalizeReturnTo } from '@e-sign/lib/utils/is-valid-return-to';
import { prisma } from '@e-sign/prisma';
import { Hono } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { getAuthSecret } from '../lib/session/session-cookies';
import { onAuthorize } from '../lib/utils/authorizer';
import type { HonoAuthContext } from '../types/context';

const cookie = () => formatHostCookieName('managed_sign_in');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const managedRoute = new Hono<HonoAuthContext>()
  .post('/start', async (c) => {
    try {
      if (
        c.req.header('Origin') !== new URL(NEXT_PUBLIC_WEBAPP_URL()).origin ||
        !isSigninEnabledForProvider('email') ||
        !getManagedBackend()
      ) {
        return c.json({ message: 'Managed sign-in is not available yet. Use local sign-in.' }, 400);
      }
      const limit = await loginRateLimit.check({
        ip: c.get('requestMetadata').ipAddress ?? 'unknown',
        identifier: 'managed-sign-in',
      });
      const limited = rateLimitResponse(c, limit);
      if (limited) {
        return limited;
      }
      await prisma.anonymousVerificationToken.deleteMany({
        where: { token: { startsWith: 'managed:' }, expiresAt: { lte: new Date() } },
      });
      const input = await c.req.json().catch(() => ({}));
      const returnTo =
        typeof input.returnTo === 'string' && isValidReturnTo(input.returnTo) ? normalizeReturnTo(input.returnTo) : '/';
      const nonce = randomBytes(32).toString('hex');
      await prisma.anonymousVerificationToken.create({
        data: { token: `managed:${digest(nonce)}`, expiresAt: new Date(Date.now() + 600000) },
      });
      await setSignedCookie(c, cookie(), JSON.stringify({ nonce, returnTo }), getAuthSecret(), {
        httpOnly: true,
        secure: shouldUseSecureCookies(),
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      });
      return c.json({ ready: true });
    } catch {
      return c.json({ message: 'Managed sign-in is not available yet. Use local sign-in.' }, 503);
    }
  })
  .post('/complete', async (c) => {
    try {
      if (c.req.header('Origin') !== new URL(NEXT_PUBLIC_WEBAPP_URL()).origin || !isSigninEnabledForProvider('email')) {
        throw new Error();
      }
      const nonce = await getSignedCookie(c, getAuthSecret(), cookie());
      deleteCookie(c, cookie(), { path: '/', secure: shouldUseSecureCookies() });
      if (typeof nonce !== 'string') {
        throw new Error();
      }
      const state = JSON.parse(nonce);
      if (typeof state.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(state.nonce)) {
        throw new Error();
      }
      const consumed = await prisma.anonymousVerificationToken.deleteMany({
        where: { token: `managed:${digest(state.nonce)}`, expiresAt: { gt: new Date() } },
      });
      if (consumed.count !== 1) {
        throw new Error();
      }
      const backend = getManagedBackend();
      if (!backend) {
        throw new Error();
      }
      const input = await c.req.json();
      if (typeof input.token !== 'string') {
        throw new Error();
      }
      const identity = await verifyManagedToken(input.token, backend);
      if (
        !isEmailDomainAllowedForSignup(identity.email) ||
        isDisposableEmail(identity.email, await getEmailBlocklistDomains())
      ) {
        throw new Error();
      }
      const accountId = `${digest(identity.issuer)}:${identity.subject}`;
      let account = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider: 'managed', providerAccountId: accountId } },
        include: { user: true },
      });
      if (!account) {
        if (
          !isSignupEnabledForProvider('email') ||
          (await prisma.user.findFirst({ where: { email: identity.email } }))
        ) {
          throw new Error();
        }
        const user = await prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              name: identity.name,
              email: identity.email,
              emailVerified: identity.emailVerified ? new Date() : null,
            },
          });
          await tx.account.create({
            data: { userId: created.id, type: 'oauth', provider: 'managed', providerAccountId: accountId },
          });
          return created;
        });
        await onCreateUserHook(user);
        account = await prisma.account.findUniqueOrThrow({
          where: { provider_providerAccountId: { provider: 'managed', providerAccountId: accountId } },
          include: { user: true },
        });
      } else if (identity.emailVerified && account.user.email === identity.email && !account.user.emailVerified) {
        await prisma.user.update({ where: { id: account.userId }, data: { emailVerified: new Date() } });
      }
      if (!identity.emailVerified) {
        if (account.user.email !== identity.email) {
          throw new Error();
        }
        if (!account.user.emailVerified) {
          await jobsClient.triggerJob({ name: 'send.signup.confirmation.email', payload: { email: identity.email } });
          return c.json(
            {
              code: 'email_verification_required',
              message: 'Check your email to verify this account, then sign in again.',
            },
            403,
          );
        }
      }
      if (account.user.twoFactorEnabled) {
        return c.json({ message: 'Use local sign-in to complete your account’s extra verification.' }, 403);
      }
      await onAuthorize({ userId: account.userId }, c);
      return c.json({
        redirectUrl:
          typeof state.returnTo === 'string' && isValidReturnTo(state.returnTo)
            ? normalizeReturnTo(state.returnTo)
            : '/',
      });
    } catch {
      return c.json({ message: 'Managed sign-in was refused. Sign in again or use your local account.' }, 401);
    }
  });
