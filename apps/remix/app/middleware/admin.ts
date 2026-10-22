import { getOptionalSession } from '@e-sign/auth/server/lib/utils/get-session';
import { isAdmin } from '@e-sign/lib/utils/is-admin';
import { type MiddlewareFunction, redirect } from 'react-router';

export const adminMiddleware: MiddlewareFunction = async ({ request }, next) => {
  const { user } = await getOptionalSession(request);

  if (!user || !isAdmin(user)) {
    throw redirect('/');
  }

  return next();
};
