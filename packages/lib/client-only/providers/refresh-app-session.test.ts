import { describe, expect, it, vi } from 'vitest';
import { refreshAppSession } from './refresh-app-session';

describe('account refresh', () => {
  const identity = { isAuthenticated: true as const, user: { id: 1 }, session: { id: 'own-session' } };
  const readIdentity = async () => identity as never;

  it.each([429, 500])('preserves existing account data when workspace refresh answers %s', async (status) => {
    const result = await refreshAppSession(readIdentity, async () => {
      throw Object.assign(new Error('Refresh refused'), { status });
    });
    expect(result).toEqual({ status: 'unavailable' });
    expect(result).not.toHaveProperty('session');
  });
  it('does not turn an aborted identity request into a sign-out', async () => {
    expect(
      await refreshAppSession(async () => {
        throw new Error('Aborted');
      }, vi.fn()),
    ).toEqual({ status: 'unavailable' });
  });
  it('clears a session that is explicitly no longer authenticated', async () => {
    const workspaces = vi.fn();
    expect(await refreshAppSession(async () => ({ isAuthenticated: false }), workspaces)).toEqual({
      status: 'signed-out',
    });
    expect(workspaces).not.toHaveBeenCalled();
  });
  it('accepts an actual empty workspace list after membership is removed', async () => {
    expect(await refreshAppSession(readIdentity, async () => [])).toEqual({
      status: 'ready',
      session: { user: identity.user, session: identity.session, organisations: [] },
    });
  });
});
