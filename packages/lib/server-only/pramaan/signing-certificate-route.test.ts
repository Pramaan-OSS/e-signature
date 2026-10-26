import { afterEach, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => vi.fn());
vi.mock('@e-sign/auth/server/lib/utils/get-session', () => ({ getOptionalSession: session }));
vi.mock('@e-sign/lib/server-only/pramaan/pdf-evidence', () => ({ signingServiceSettings: () => ({ remote: false }) }));

import { action } from '../../../../apps/remix/app/routes/_authenticated+/admin+/signing';
import { fakePramaan } from '../../../../scripts/testing/fake-pramaan';
import { setPramaanClientForTests } from '../pramaan';

afterEach(() => {
  setPramaanClientForTests(undefined);
  vi.unstubAllEnvs();
});
const request = (origin = 'https://app.example.test', method = 'POST') =>
  new Request('https://app.example.test/admin/signing', { method, headers: { origin } });
const invoke = (req = request()) => action({ request: req } as Parameters<typeof action>[0]);
it.each([null, { roles: [] }])('refuses non-administrators before any read: %s', async (user) => {
  session.mockResolvedValue({ user });
  const call = vi.fn();
  setPramaanClientForTests({ call } as never);
  await expect(invoke()).rejects.toMatchObject({ status: 403 });
  expect(call).not.toHaveBeenCalled();
});
it('refuses cross-origin submissions and unsupported methods without a read', async () => {
  session.mockResolvedValue({ user: { roles: ['ADMIN'] } });
  const call = vi.fn();
  setPramaanClientForTests({ call } as never);
  await expect(invoke(request('https://another.example.test'))).rejects.toMatchObject({ status: 403 });
  await expect(invoke(request('https://app.example.test', 'GET'))).rejects.toMatchObject({ status: 405 });
  expect(call).not.toHaveBeenCalled();
});
it.each(['success', 'unavailable', 'refused'] as const)('admin read handles %s as a plain result', async (mode) => {
  session.mockResolvedValue({ user: { roles: ['ADMIN'] } });
  vi.stubEnv('PRAMAAN_SIGNING_ACCOUNT', 'owned-signing-account');
  setPramaanClientForTests(fakePramaan(mode === 'success' ? {} : { certificateRead: mode }));
  const result = await invoke();
  expect(result.status).toBe(mode === 'success' ? 'ready' : mode);
  if (mode === 'unavailable') {
    expect(result.message).toContain('not available yet');
  }
});
