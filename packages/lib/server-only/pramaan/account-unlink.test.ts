import { deleteAccountProvider } from '@e-sign/auth/server/lib/utils/delete-account-provider';
import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  password: null as string | null,
  passkeys: 0,
  remaining: 0,
  remove: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@e-sign/auth/server/lib/utils/get-session', () => ({ getSession: async () => ({ user: { id: 7 } }) }));
vi.mock('@e-sign/prisma', () => ({
  prisma: {
    $transaction: async (fn: any, options: any) => {
      m.transaction(options);
      return fn({
        user: { findUniqueOrThrow: async () => ({ password: m.password, _count: { passkeys: m.passkeys } }) },
        account: { count: async () => m.remaining, delete: m.remove },
        userSecurityAuditLog: { create: m.audit },
      });
    },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.password = null;
  m.passkeys = 0;
  m.remaining = 0;
  m.remove.mockResolvedValue({ type: 'oauth' });
});
const context = { get: () => ({ ipAddress: '127.0.0.1', userAgent: 'QA' }) } as never;
it('refuses removal of the last sign-in method without changing the account', async () => {
  await expect(deleteAccountProvider(context, 'account_1')).rejects.toThrow('Add another sign-in method');
  expect(m.remove).not.toHaveBeenCalled();
  expect(m.audit).not.toHaveBeenCalled();
});
it.each([
  'password',
  'passkey',
  'linked account',
])('allows unlink with an available %s and serializes concurrent removals', async (method) => {
  if (method === 'password') {
    m.password = 'hashed';
  }
  if (method === 'passkey') {
    m.passkeys = 1;
  }
  if (method === 'linked account') {
    m.remaining = 1;
  }
  await deleteAccountProvider(context, 'account_1');
  expect(m.remove).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'account_1', userId: 7 } }));
  expect(m.audit).toHaveBeenCalledOnce();
  expect(m.transaction).toHaveBeenCalledWith({ isolationLevel: 'Serializable' });
});
