import { NEXT_PUBLIC_WEBAPP_URL } from '@e-sign/lib/constants/app';
import { formatHostCookieName } from '@e-sign/lib/constants/auth';
import { redeemOrganisationSignIn, startOrganisationSignIn } from '@e-sign/lib/server-only/pramaan/enterprise-auth';
import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import type { HonoAuthContext } from '../../types/context';
import { getOptionalNonEmbedSession } from '../session/embed-session-restrictions';
import { getAuthSecret } from '../session/session-cookies';
import { onAuthorize } from './authorizer';

const cookieName = () => formatHostCookieName('organisation_sign_in');
export async function authorizeOrganisation(c: Context<HonoAuthContext>, orgUrl: string) {
  try {
    if (c.req.header('Origin') !== new URL(NEXT_PUBLIC_WEBAPP_URL()).origin) {
      throw new Error();
    }
    const { session, user } = await getOptionalNonEmbedSession(c);
    const principal = session && user ? { userId: user.id, sessionId: session.id } : undefined;
    const started = await startOrganisationSignIn(orgUrl, principal);
    await setSignedCookie(c, cookieName(), started.state, getAuthSecret(), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    return c.json({ redirectUrl: started.authorizationUrl });
  } catch {
    return c.json(
      {
        code: 'SIGN_IN_UNAVAILABLE',
        message: 'Organisation sign-in could not start. Check its setup or use local sign-in.',
        statusCode: 400,
      },
      400,
    );
  }
}
export async function completeOrganisation(c: Context<HonoAuthContext>, orgUrl: string) {
  const browserState = await getSignedCookie(c, getAuthSecret(), cookieName());
  deleteCookie(c, cookieName(), { secure: true, path: '/' });
  try {
    const { session, user } = await getOptionalNonEmbedSession(c);
    const result = await redeemOrganisationSignIn(
      orgUrl,
      {
        code: c.req.query('code'),
        state: c.req.query('state'),
        browserState: typeof browserState === 'string' ? browserState : undefined,
      },
      session && user ? { userId: user.id, sessionId: session.id } : undefined,
    );
    await onAuthorize({ userId: result.userId }, c);
    return c.redirect(result.redirectPath, 302);
  } catch {
    return c.redirect(`/o/${encodeURIComponent(orgUrl)}/signin?error=organisation-sign-in`, 302);
  }
}
