import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  let connection: any = null;
  let counter = 0;
  const attempts = new Map<string, any>();
  const identities = new Map<string, any>();
  return {
    reset() {
      connection = null;
      counter = 0;
      attempts.clear();
      identities.clear();
    },
    connection: () => connection,
    organisation: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.members.some.userId === 1 ? { id: 'org_1', url: 'workspace', name: 'Workspace' } : null,
      ),
      findUnique: vi.fn(async ({ where }: any) =>
        where.url === 'workspace' ? { id: 'org_1', url: 'workspace' } : null,
      ),
    },
    organisationMember: {
      findUnique: vi.fn(async ({ where }: any) =>
        [1, 2].includes(where.userId_organisationId.userId) ? { userId: where.userId_organisationId.userId } : null,
      ),
    },
    enterpriseSignInConnection: {
      findUnique: vi.fn(async ({ where }: any) =>
        connection && (where.organisationId === connection.organisationId || where.id === connection.id)
          ? connection
          : null,
      ),
      create: vi.fn(
        async ({ data }: any) =>
          (connection = { id: `connection_local_${++counter}`, status: 'creating', ref: null, ...data }),
      ),
      update: vi.fn(async ({ data }: any) => (connection = { ...connection, ...data })),
      delete: vi.fn(async () => {
        connection = null;
      }),
      deleteMany: vi.fn(async () => {
        connection = null;
        return { count: 1 };
      }),
    },
    enterpriseSignInAttempt: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }: any) => {
        attempts.set(data.stateHash, { ...data, consumedAt: null });
        return data;
      }),
      findUnique: vi.fn(async ({ where }: any) => attempts.get(where.stateHash)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = attempts.get(where.stateHash);
        if (!row || row.consumedAt || row.expiresAt <= new Date()) {
          return { count: 0 };
        }
        attempts.set(where.stateHash, { ...row, ...data });
        return { count: 1 };
      }),
    },
    enterpriseSignInIdentity: {
      findUnique: vi.fn(async ({ where }: any) => identities.get(JSON.stringify(where.connectionId_subjectId))),
      create: vi.fn(async ({ data }: any) => {
        identities.set(JSON.stringify({ connectionId: data.connectionId, subjectId: data.subjectId }), data);
        return data;
      }),
    },
  };
});
vi.mock('@e-sign/prisma', () => ({ prisma: db }));

import { setPramaanClientForTests } from '../pramaan';
import {
  createOrganisationConnection,
  deleteOrganisationConnection,
  listOrganisationConnections,
  redeemOrganisationSignIn,
  startOrganisationSignIn,
} from './enterprise-auth';

const calls: { id: string; input: any; options: any }[] = [];
const started = new Map<string, any>();
let remote: any;
let redeemed = new Set<string>();
const fake = {
  call: vi.fn(async (id: string, input: any, options: any) => {
    calls.push({ id, input, options });
    if (id === 'auth.enterprise-connection.create') {
      return (remote = {
        ref: 'connection_owned',
        organizationRef: input.organizationRef,
        name: input.name,
        status: 'ready',
        createdAt: new Date().toISOString(),
      });
    }
    if (id === 'auth.enterprise-connections.list') {
      return { results: remote ? [remote] : [] };
    }
    if (id === 'auth.enterprise-connection.delete') {
      remote = null;
      return { deleted: true };
    }
    if (id === 'auth.enterprise.start') {
      started.set(input.state, input);
      return {
        authorizationUrl: `https://platform.example.test/connect/link/${input.state}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      };
    }
    if (id === 'auth.social.exchange') {
      const run = started.get(input.state);
      if (
        !run ||
        redeemed.has(input.code) ||
        input.code !== `code_${input.state}` ||
        run.connectionRef !== input.connectionRef ||
        run.redirectUri !== input.redirectUri ||
        run.nonce !== input.expectedNonce ||
        run.codeChallenge !== createHash('sha256').update(input.pkceVerifier).digest('base64url')
      ) {
        throw { code: 'invalid_request', effect: 'none' };
      }
      redeemed.add(input.code);
      return {
        providerKey: 'enterprise',
        subjectId: 'subject_owned',
        email: 'owner@example.test',
        emailVerified: true,
      };
    }
    throw new Error('Unexpected capability');
  }),
};
const config = {
  name: 'Workspace sign-in',
  issuer: 'https://login.example.test',
  clientId: 'test-client',
  clientSecret: 'test-only-client-secret',
  tokenAuthMethod: 'client_secret_basic' as const,
};
const principal = { userId: 2, sessionId: 'member_session' };
const complete = (state: string) => ({ state, browserState: state, code: `code_${state}` });
beforeEach(() => {
  db.reset();
  calls.length = 0;
  started.clear();
  redeemed = new Set();
  remote = undefined;
  vi.clearAllMocks();
  vi.stubEnv('PRAMAAN_API_KEY', 'fake');
  vi.stubEnv('NEXT_PUBLIC_WEBAPP_URL', 'https://app.example.test');
  vi.stubEnv('PRAMAAN_BASE_URL', 'https://platform.example.test');
  vi.stubEnv('NEXT_PRIVATE_ENCRYPTION_KEY', 'test-only-encryption-key');
  setPramaanClientForTests(fake as never);
});
afterEach(() => {
  setPramaanClientForTests(undefined);
  vi.unstubAllEnvs();
});
it('creates, lists and deletes only an administrator-owned connection with explicit approval', async () => {
  await expect(createOrganisationConnection(2, 'workspace', config, true)).rejects.toThrow('administrator');
  await expect(createOrganisationConnection(1, 'workspace', config, false)).rejects.toThrow('Confirm');
  expect(fake.call).not.toHaveBeenCalled();
  const row = await createOrganisationConnection(1, 'workspace', config, true);
  expect(row.ref).toBe('connection_owned');
  expect(row).not.toHaveProperty('clientSecret');
  expect(calls[0]).toMatchObject({
    id: 'auth.enterprise-connection.create',
    input: { redirectUris: ['https://app.example.test/api/auth/callback/oidc/org/workspace'] },
    options: { idempotencyKey: `enterprise:${row.id}:create` },
  });
  expect(await listOrganisationConnections(1, 'workspace')).toEqual([
    { name: config.name, status: 'ready', createdAt: remote.createdAt },
  ]);
  await expect(deleteOrganisationConnection(2, 'workspace', true)).rejects.toThrow('administrator');
  await expect(deleteOrganisationConnection(1, 'workspace', false)).rejects.toThrow('Confirm');
  await deleteOrganisationConnection(1, 'workspace', true);
  expect(db.connection()).toBeNull();
  expect(calls.at(-1)).toMatchObject({
    id: 'auth.enterprise-connection.delete',
    input: { ref: 'connection_owned', confirm: true },
  });
});
it('starts with fresh state, nonce and proof key, then explicitly links an existing member', async () => {
  await createOrganisationConnection(1, 'workspace', config, true);
  const run = await startOrganisationSignIn('workspace', principal);
  const begin = calls.at(-1)!;
  expect(begin.id).toBe('auth.enterprise.start');
  expect(begin.input.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(begin.input.nonce).not.toBe(run.state);
  const encrypted = db.enterpriseSignInAttempt.create.mock.calls[0][0].data.secrets;
  expect(encrypted).not.toContain(begin.input.nonce);
  expect(await redeemOrganisationSignIn('workspace', complete(run.state), principal)).toEqual({
    userId: 2,
    redirectPath: '/o/workspace',
  });
  expect(calls.at(-1)).toMatchObject({
    id: 'auth.social.exchange',
    input: {
      providerKey: 'enterprise',
      connectionRef: 'connection_owned',
      state: run.state,
      expectedNonce: begin.input.nonce,
    },
  });
  expect(db.enterpriseSignInIdentity.create).toHaveBeenCalledWith({
    data: { connectionId: db.connection().id, subjectId: 'subject_owned', userId: 2 },
  });
});
it('signs in a linked subject while ignoring email claims, then refuses callback replay', async () => {
  await createOrganisationConnection(1, 'workspace', config, true);
  const linking = await startOrganisationSignIn('workspace', principal);
  await redeemOrganisationSignIn('workspace', complete(linking.state), principal);
  const login = await startOrganisationSignIn('workspace');
  expect((await redeemOrganisationSignIn('workspace', complete(login.state))).userId).toBe(2);
  const count = calls.length;
  await expect(redeemOrganisationSignIn('workspace', complete(login.state))).rejects.toThrow('could not');
  expect(calls).toHaveLength(count);
});
it.each(['missing', 'wrong'] as const)('refuses %s callback state before any exchange', async (mode) => {
  await createOrganisationConnection(1, 'workspace', config, true);
  const run = await startOrganisationSignIn('workspace');
  const count = calls.length;
  await expect(
    redeemOrganisationSignIn('workspace', {
      ...complete(run.state),
      state: mode === 'missing' ? undefined : 'x'.repeat(43),
    }),
  ).rejects.toThrow('could not');
  expect(calls).toHaveLength(count);
});
it('refuses a sign-in not started here and refuses platform redemption that was not started there', async () => {
  await createOrganisationConnection(1, 'workspace', config, true);
  await expect(redeemOrganisationSignIn('workspace', complete('x'.repeat(43)))).rejects.toThrow('could not');
  const run = await startOrganisationSignIn('workspace', principal);
  started.clear();
  await expect(redeemOrganisationSignIn('workspace', complete(run.state), principal)).rejects.toThrow(
    'Check its status',
  );
  expect(db.enterpriseSignInIdentity.create).not.toHaveBeenCalled();
});
it('never auto-links a verified email to an existing account and requires the same linking session', async () => {
  await createOrganisationConnection(1, 'workspace', config, true);
  const anonymous = await startOrganisationSignIn('workspace');
  await expect(redeemOrganisationSignIn('workspace', complete(anonymous.state))).rejects.toThrow('Link organisation');
  expect(db.enterpriseSignInIdentity.create).not.toHaveBeenCalled();
  const linking = await startOrganisationSignIn('workspace', principal);
  await expect(
    redeemOrganisationSignIn('workspace', complete(linking.state), { ...principal, sessionId: 'different_session' }),
  ).rejects.toThrow('could not');
});
it('the platform fake refuses missing/wrong state and an already redeemed code', async () => {
  await createOrganisationConnection(1, 'workspace', config, true);
  const run = await startOrganisationSignIn('workspace', principal);
  await redeemOrganisationSignIn('workspace', complete(run.state), principal);
  const input = calls.at(-1)!.input;
  for (const state of [undefined, 'x'.repeat(43), run.state]) {
    await expect(fake.call('auth.social.exchange', { ...input, state }, {})).rejects.toMatchObject({
      code: 'invalid_request',
    });
  }
});
it('a missing key or insecure callback keeps organisation sign-in off', async () => {
  vi.stubEnv('PRAMAAN_API_KEY', '');
  await expect(createOrganisationConnection(1, 'workspace', config, true)).rejects.toThrow('HTTPS');
  vi.stubEnv('PRAMAAN_API_KEY', 'fake');
  vi.stubEnv('NEXT_PUBLIC_WEBAPP_URL', 'http://localhost:3012');
  await expect(createOrganisationConnection(1, 'workspace', config, true)).rejects.toThrow('HTTPS');
  expect(fake.call).not.toHaveBeenCalled();
});
it('an uncertain setup retains its stable request key and only retries identical settings', async () => {
  fake.call.mockRejectedValueOnce({ code: 'upstream_unavailable' });
  await expect(createOrganisationConnection(1, 'workspace', config, true)).rejects.toThrow();
  const id = db.connection().id;
  await expect(createOrganisationConnection(1, 'workspace', { ...config, clientId: 'changed' }, true)).rejects.toThrow(
    'same settings',
  );
  await createOrganisationConnection(1, 'workspace', config, true);
  expect(calls.at(-1)!.options.idempotencyKey).toBe(`enterprise:${id}:create`);
});

it('expiry and removed membership stop sign-in without email-based fallback', async () => {
  await createOrganisationConnection(1, 'workspace', config, true);
  const run = await startOrganisationSignIn('workspace', principal);
  db.enterpriseSignInAttempt.findUnique.mockResolvedValueOnce({
    ...db.enterpriseSignInAttempt.create.mock.calls[0][0].data,
    expiresAt: new Date(0),
    consumedAt: null,
  } as never);
  await expect(redeemOrganisationSignIn('workspace', complete(run.state), principal)).rejects.toThrow('could not');
  db.organisationMember.findUnique.mockResolvedValueOnce(null);
  await expect(startOrganisationSignIn('workspace', principal)).rejects.toThrow('not a member');
});
it('a definite setup refusal removes only the unfinished local marker', async () => {
  fake.call.mockRejectedValueOnce({ code: 'invalid_request', effect: 'none' });
  await expect(createOrganisationConnection(1, 'workspace', config, true)).rejects.toThrow();
  expect(db.connection()).toBeNull();
  expect(db.enterpriseSignInConnection.deleteMany).toHaveBeenCalledWith({
    where: { id: 'connection_local_1', status: 'creating', ref: null },
  });
});
