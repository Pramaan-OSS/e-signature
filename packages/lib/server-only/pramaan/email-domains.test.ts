import { afterEach, expect, it, vi } from 'vitest';
import { setPramaanClientForTests } from '../pramaan';
import { createEmailDomain, deleteEmailDomain, verifyEmailDomain } from './email-domains';

const database = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: 'owned_domain', domain: 'example.test' })),
  findUniqueOrThrow: vi.fn(async () => ({ id: 'owned_domain', domain: 'example.test' })),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('@e-sign/prisma', () => ({ prisma: { emailDomain: database } }));
const records = [{ name: '_verify.example.test', type: 'TXT', value: 'opaque-proof' }];
const call = vi.fn(async () => ({ status: 'verified', dnsRecords: records }));
afterEach(() => {
  setPramaanClientForTests(undefined);
  call.mockClear();
});
it('stores the returned DNS records without generating vendor-specific records', async () => {
  setPramaanClientForTests({ call } as never);
  const result = await createEmailDomain({ domain: 'example.test', organisationId: 'owned_org' });
  expect(call).toHaveBeenCalledWith(
    'email.domain.verify',
    { domain: 'example.test' },
    { idempotencyKey: 'domain-add:owned_org:example.test' },
  );
  expect(result.records).toEqual(records);
  expect(database.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ dnsRecords: records, privateKey: '', status: 'ACTIVE' }),
    }),
  );
});
it('checks verification through the domain capability', async () => {
  setPramaanClientForTests({ call } as never);
  expect(await verifyEmailDomain('owned_domain')).toMatchObject({ isVerified: true });
  expect(call).toHaveBeenCalledWith('email.domain.get', { domain: 'example.test' }, undefined);
});
it('removes the hosted domain before deleting its local record', async () => {
  setPramaanClientForTests({ call } as never);
  await deleteEmailDomain({ emailDomainId: 'owned_domain' });
  expect(call).toHaveBeenCalledWith(
    'email.domain.delete',
    { domain: 'example.test' },
    { idempotencyKey: 'domain-delete:owned_domain' },
  );
  expect(database.delete).toHaveBeenCalledWith({ where: { id: 'owned_domain' } });
});
it.each([
  'create',
  'verify',
  'delete',
])('unavailable domain %s does not change or activate the saved domain', async (action) => {
  database.create.mockClear();
  database.update.mockClear();
  database.delete.mockClear();
  setPramaanClientForTests({
    call: async () => {
      throw { code: 'upstream_unavailable', message: 'Private source detail' };
    },
  } as never);
  const run =
    action === 'create'
      ? createEmailDomain({ domain: 'example.test', organisationId: 'owned_org' })
      : action === 'verify'
        ? verifyEmailDomain('owned_domain')
        : deleteEmailDomain({ emailDomainId: 'owned_domain' });
  await expect(run).rejects.toMatchObject({
    code: 'upstream_unavailable',
    message: expect.stringContaining('not available yet'),
  });
  expect(database.create).not.toHaveBeenCalled();
  expect(database.update).not.toHaveBeenCalled();
  expect(database.delete).not.toHaveBeenCalled();
});
