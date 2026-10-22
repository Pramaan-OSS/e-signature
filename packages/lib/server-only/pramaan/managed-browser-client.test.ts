import { afterEach, expect, it, vi } from 'vitest';
import { managedSignInClient } from '../../../../apps/remix/app/utils/managed-auth-client';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Response.json(
        String(url).endsWith('/token')
          ? { token: 'signed-session-token' }
          : { user: { id: 'user_1' }, token: 'session-cookie-token' },
      );
    }),
  );
  return { client: managedSignInClient('https://auth.example.test'), requests };
}
it('gets the JWT from the exact token endpoint with the session cookie', async () => {
  const { client, requests } = fixture();
  expect((await client.token()).data).toEqual({ token: 'signed-session-token' });
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe('https://auth.example.test/token');
  expect(requests[0].init).toMatchObject({ method: 'GET', credentials: 'include' });
});
it('uses the exact email sign-up and sign-in endpoints', async () => {
  const { client, requests } = fixture();
  const input = {
    email: 'member@example.com',
    password: 'example-password',
    callbackURL: 'http://localhost:3010/managed-callback',
  };
  await client.signUp.email({ ...input, name: 'Member' });
  await client.signIn.email(input);
  expect(requests.map((r) => r.url)).toEqual([
    'https://auth.example.test/sign-up/email',
    'https://auth.example.test/sign-in/email',
  ]);
  for (const request of requests) {
    expect(request.init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(request.init?.body))).toMatchObject(input);
  }
});
it('starts a personal-account redirect at the exact social endpoint', async () => {
  const { client, requests } = fixture();
  await client.signIn.social({ provider: 'google', callbackURL: 'http://localhost:3000/managed-callback' });
  expect(requests[0].url).toBe('https://auth.example.test/sign-in/social');
  expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({
    callbackURL: 'http://localhost:3000/managed-callback',
  });
});
it('preserves a refused callback as an error rather than successful sign-in', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ code: 'INVALID_CALLBACKURL', message: 'Invalid callback URL' }, { status: 403 })),
  );
  const result = await managedSignInClient('https://auth.example.test').signIn.social({
    provider: 'google',
    callbackURL: 'https://foreign.example/managed-callback',
  });
  expect(result.error).toMatchObject({ status: 403, code: 'INVALID_CALLBACKURL' });
});
