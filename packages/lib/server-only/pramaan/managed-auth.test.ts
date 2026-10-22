import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setPramaanClientForTests } from '../pramaan';
import { provisionManagedAuth, verifyManagedToken } from './managed-auth';

let directory: string;
let key: string | undefined;
const backend = {
  authUrl: 'https://auth.example.test',
  jwksUrl: 'https://auth.example.test/.well-known/jwks.json',
  appOrigin: 'http://localhost:3012',
};
const token = (extra = {}) =>
  `header.${Buffer.from(JSON.stringify({ sub: 'user_1', iss: 'https://auth.example.test', aud: 'https://auth.example.test', email: 'managed@example.com', name: 'Managed User', emailVerified: true, exp: Math.floor(Date.now() / 1000) + 600, ...extra })).toString('base64url')}.signature`;
beforeEach(() => {
  key = process.env.PRAMAAN_API_KEY;
  process.env.PRAMAAN_API_KEY = 'dummy-offline';
  mkdirSync(resolve('../../.scratch'), { recursive: true });
  directory = mkdtempSync(resolve('../../.scratch/auth-'));
});
afterEach(() => {
  if (key === undefined) {
    delete process.env.PRAMAAN_API_KEY;
  } else {
    process.env.PRAMAAN_API_KEY = key;
  }
  setPramaanClientForTests(undefined);
  rmSync(directory, { recursive: true, force: true });
});
it('provisions and reuses a private backend, skipping domains for localhost', async () => {
  const call = vi.fn(async (_id: string, _input: unknown) => ({
    status: 'ready',
    authUrl: backend.authUrl,
    jwksUrl: backend.jwksUrl,
  }));
  setPramaanClientForTests({ call } as never);
  const notify = vi.fn();
  expect(await provisionManagedAuth(directory, backend.appOrigin, notify)).toEqual(backend);
  await provisionManagedAuth(directory, backend.appOrigin, notify);
  expect(call).toHaveBeenCalledOnce();
  expect(call.mock.calls[0][0]).toBe('auth.backend.provision');
  expect(statSync(resolve(directory, 'auth.json')).mode & 0o777).toBe(0o600);
  expect(notify).toHaveBeenCalledWith('Managed sign-in uses the development address; public domain setup skipped.');
});
it('registers a public application origin and reuses its confirmed configuration', async () => {
  const call = vi.fn(async (id: string) =>
    id === 'auth.backend.domains.set'
      ? { allowedDomains: ['https://app.example.com'] }
      : { status: 'ready', authUrl: backend.authUrl, jwksUrl: backend.jwksUrl },
  );
  setPramaanClientForTests({ call } as never);
  await provisionManagedAuth(directory, 'https://app.example.com');
  await provisionManagedAuth(directory, 'https://app.example.com');
  expect(call).toHaveBeenCalledTimes(2);
  expect(call.mock.calls[1].slice(0, 2)).toMatchObject([
    'auth.backend.domains.set',
    { domains: ['https://app.example.com'] },
  ]);
});
it('retains local sign-in when provisioning is unavailable', async () => {
  const call = vi.fn(async () => {
    throw { code: 'upstream_unavailable' };
  });
  setPramaanClientForTests({ call } as never);
  const notify = vi.fn();
  expect(await provisionManagedAuth(directory, backend.appOrigin, notify)).toBeUndefined();
  expect(notify).toHaveBeenCalledExactlyOnceWith(
    'Managed sign-in is not available yet; local sign-in remains available.',
  );
});
it('does not provision without a key', async () => {
  delete process.env.PRAMAAN_API_KEY;
  const call = vi.fn();
  setPramaanClientForTests({ call } as never);
  expect(await provisionManagedAuth(directory, backend.appOrigin)).toBeUndefined();
  expect(call).not.toHaveBeenCalled();
});
it('reads signed email after verification with no profile fields in the verification result', async () => {
  const call = vi.fn(async () => ({
    valid: true,
    userId: 'user_1',
    sessionId: 'session_1',
    orgId: undefined,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  }));
  setPramaanClientForTests({ call } as never);
  const value = token();
  expect(await verifyManagedToken(value, backend)).toMatchObject({
    subject: 'user_1',
    email: 'managed@example.com',
    emailVerified: true,
  });
  expect(call).toHaveBeenCalledWith(
    'auth.token.verify',
    { token: value, audience: 'https://auth.example.test', authorizedParties: [backend.appOrigin] },
    undefined,
  );
});
it('refuses a rejected token before reading its claims', async () => {
  const call = vi.fn(async () => ({ valid: false }));
  setPramaanClientForTests({ call } as never);
  await expect(verifyManagedToken(token(), backend)).rejects.toThrow('refused');
});
it.each([
  { sub: 'other' },
  { iss: 'https://other.example.test' },
  { aud: 'other' },
  { exp: 1 },
  { email: undefined },
])('refuses inconsistent or incomplete verified claims %j', async (extra) => {
  setPramaanClientForTests({ call: async () => ({ valid: true, userId: 'user_1' }) } as never);
  await expect(verifyManagedToken(token(extra), backend)).rejects.toThrow();
});
