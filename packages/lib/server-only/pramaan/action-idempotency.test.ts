import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakePramaan } from '../../../../scripts/testing/fake-pramaan';
import { callPramaan, setPramaanClientForTests } from '../pramaan';
import { CATALOG } from './catalog';
import { provisionManagedAuth } from './managed-auth';
import { provisionManagedDatabase } from './managed-database';
import { runtimeActionKey, startupRefusal } from './runtime-action-key';

let directory: string;
let originalKey: string | undefined;
beforeEach(() => {
  originalKey = process.env.PRAMAAN_API_KEY;
  process.env.PRAMAAN_API_KEY = 'offline-only';
  mkdirSync(resolve('../../.scratch'), { recursive: true });
  directory = mkdtempSync(resolve('../../.scratch/action-key-'));
});
afterEach(() => {
  setPramaanClientForTests(undefined);
  if (originalKey === undefined) {
    delete process.env.PRAMAAN_API_KEY;
  } else {
    process.env.PRAMAAN_API_KEY = originalKey;
  }
  rmSync(directory, { recursive: true, force: true });
});
it('saves a stable request identifier with private permissions before calling', () => {
  const key = runtimeActionKey(directory, 'managed-signin');
  expect(runtimeActionKey(directory, 'managed-signin')).toBe(key);
  const path = resolve(directory, 'managed-signin-key.json');
  expect(JSON.parse(readFileSync(path, 'utf8')).key).toBe(key);
  expect(statSync(path).mode & 0o777).toBe(0o600);
});
it('reuses the sign-in provision identifier after a lost reply', async () => {
  const options: unknown[] = [];
  let first = true;
  setPramaanClientForTests({
    call: vi.fn(async (_id, _input, opts) => {
      options.push(opts);
      expect(readFileSync(resolve(directory, 'managed-signin-key.json'), 'utf8')).toContain(opts!.idempotencyKey!);
      if (first) {
        first = false;
        throw { code: 'upstream_timeout' };
      }
      return { status: 'ready', authUrl: 'https://auth.example.test', jwksUrl: 'https://auth.example.test/jwks' };
    }),
  } as never);
  await expect(provisionManagedAuth(directory, 'http://localhost:3012')).rejects.toThrow();
  await provisionManagedAuth(directory, 'http://localhost:3012', vi.fn());
  expect(options[0]).toEqual(options[1]);
});
it('reuses a failed domain request but uses a fresh identifier for a later change', async () => {
  const keys: string[] = [];
  let fail = true;
  setPramaanClientForTests({
    call: vi.fn(async (id, input, opts) => {
      if (id === 'auth.backend.provision') {
        return { status: 'ready', authUrl: 'https://auth.example.test', jwksUrl: 'https://auth.example.test/jwks' };
      }
      keys.push(opts!.idempotencyKey!);
      if (fail) {
        fail = false;
        throw { code: 'upstream_unavailable' };
      }
      return { allowedDomains: input.domains };
    }),
  } as never);
  await provisionManagedAuth(directory, 'https://app.example.com', vi.fn());
  await provisionManagedAuth(directory, 'https://app.example.com', vi.fn());
  expect(keys[0]).toBe(keys[1]);
  await provisionManagedAuth(directory, 'https://second.example.com', vi.fn());
  await provisionManagedAuth(directory, 'https://app.example.com', vi.fn());
  expect(keys[3]).not.toBe(keys[0]);
});
it('reuses the saved database identifier after confirmed unavailability', async () => {
  const call = vi.fn(async () => {
    throw { code: 'upstream_unavailable' };
  });
  setPramaanClientForTests({ call } as never);
  await provisionManagedDatabase(directory, vi.fn());
  await provisionManagedDatabase(directory, vi.fn());
  expect(call.mock.calls[0]).toEqual(call.mock.calls[1]);
  expect(JSON.parse(readFileSync(resolve(directory, 'managed-database-key.json'), 'utf8')).key).toBeTruthy();
});
it.each([
  ...Object.values(CATALOG)
    .filter((info) => info.effectClass !== 'read_only')
    .map((info) => info.id),
  'auth.user.delete',
])('fake refuses action %s without the required identifier', async (id) => {
  await expect(fakePramaan().call(id as never, {} as never)).rejects.toMatchObject({
    code: 'invalid_request',
    status: 400,
    message: 'Idempotency-Key header is required for this capability.',
  });
});
it('accepts keyed startup calls in the strict fake', async () => {
  setPramaanClientForTests(fakePramaan());
  expect(await provisionManagedAuth(directory, 'https://app.example.com')).toMatchObject({
    authUrl: 'https://auth.example.test',
  });
  expect(await provisionManagedDatabase(directory, vi.fn())).toBeUndefined();
});
it('exposes only a safe refusal reason and never the upstream message or request identifier', async () => {
  setPramaanClientForTests({
    call: async () => {
      throw Object.assign(new Error('Idempotency-Key header is required for this capability. private-value'), {
        code: 'invalid_request',
      });
    },
  } as never);
  let caught: unknown;
  try {
    await callPramaan('auth.backend.provision', {});
  } catch (error) {
    caught = error;
  }
  expect(startupRefusal(caught, 'sign-in')).toBe(
    'Managed sign-in setup refused: a saved request identifier is required.',
  );
  const notify = vi.fn();
  await expect(provisionManagedDatabase(directory, notify)).rejects.toThrow('could not be confirmed');
  expect(notify).toHaveBeenCalledWith('Managed database setup refused: a saved request identifier is required.');
  expect(JSON.stringify(notify.mock.calls)).not.toContain('private-value');
});
