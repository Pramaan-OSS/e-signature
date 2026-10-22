import type { AppSession } from './session';

type Identity = Pick<AppSession, 'session' | 'user'> & { isAuthenticated: true };
type RefreshResult = { status: 'ready'; session: AppSession } | { status: 'signed-out' } | { status: 'unavailable' };

/** A refused refresh must not turn existing workspaces into an empty list. */
export async function refreshAppSession(
  readIdentity: () => Promise<Identity | { isAuthenticated: false }>,
  readWorkspaces: () => Promise<AppSession['organisations']>,
): Promise<RefreshResult> {
  try {
    const identity = await readIdentity();
    if (!identity.isAuthenticated) {
      return { status: 'signed-out' };
    }
    const organisations = await readWorkspaces();
    return {
      status: 'ready',
      session: { session: identity.session, user: identity.user, organisations },
    };
  } catch {
    return { status: 'unavailable' };
  }
}
