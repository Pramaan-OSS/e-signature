import { formatPath } from '@e-sign/lib/constants/app';
import { AppError, AppErrorCode } from '@e-sign/lib/errors/app-error';
import { getManagedBackend } from '@e-sign/lib/server-only/pramaan/managed-auth';
import { isValidReturnTo, normalizeReturnTo } from '@e-sign/lib/utils/is-valid-return-to';
import type { Context } from 'hono';
import type { OAuthClientOptions } from '../../config';

type HandleOAuthAuthorizeUrlOptions = {
  c: Context;
  clientOptions: OAuthClientOptions;
  redirectPath?: string;
  prompt?: 'none' | 'login' | 'consent' | 'select_account';
  state?: string;
};

/** Older authorization buttons enter the same managed flow as the sign-in page. */
export const handleOAuthAuthorizeUrl = async ({ c, clientOptions, redirectPath }: HandleOAuthAuthorizeUrlOptions) => {
  if (!getManagedBackend() || !['google', 'microsoft'].includes(clientOptions.id)) {
    throw new AppError(AppErrorCode.NOT_SETUP, { message: 'Managed sign-in is not available yet. Use local sign-in.' });
  }
  const returnTo = redirectPath && isValidReturnTo(redirectPath) ? (normalizeReturnTo(redirectPath) ?? '/') : '/';
  return c.json({ redirectUrl: `${formatPath('/managed-signin')}?returnTo=${encodeURIComponent(returnTo)}` });
};
