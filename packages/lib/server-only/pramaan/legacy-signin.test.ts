import { handleOAuthAuthorizeUrl } from '@e-sign/auth/server/lib/utils/handle-oauth-authorize-url';
import { Hono } from 'hono';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ ready: true }));
vi.mock('@e-sign/lib/server-only/pramaan/managed-auth', () => ({
  getManagedBackend: () => (state.ready ? { authUrl: 'https://auth.example.test' } : undefined),
}));
afterEach(() => {
  state.ready = true;
});
const run = (id: string, redirectPath?: string) =>
  new Hono()
    .get('/', (c) =>
      handleOAuthAuthorizeUrl({
        c,
        clientOptions: { id, scope: [], clientId: '', clientSecret: '', wellKnownUrl: '', redirectUrl: '' },
        redirectPath,
      }),
    )
    .request('/');
it.each([
  'google',
  'microsoft',
])('routes an older %s button to managed sign-in without own client credentials', async (id) => {
  const response = await run(id, '/embed/auth/complete');
  expect(await response.json()).toEqual({ redirectUrl: '/managed-signin?returnTo=%2Fembed%2Fauth%2Fcomplete' });
  expect(response.headers.get('set-cookie')).toBeNull();
});
it('keeps older redirects inside the app', async () => {
  expect(await (await run('google', 'https://foreign.example/')).json()).toEqual({
    redirectUrl: '/managed-signin?returnTo=%2F',
  });
});
it('does not construct an external authorization URL when managed sign-in is unavailable', async () => {
  state.ready = false;
  const response = await run('google');
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('https://');
});

it('uses the local home page when no return address is supplied', async () => {
  expect(await (await run('google')).json()).toEqual({ redirectUrl: '/managed-signin?returnTo=%2F' });
});
