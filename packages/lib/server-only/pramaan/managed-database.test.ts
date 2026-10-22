import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setPramaanClientForTests } from '../pramaan';
import { provisionManagedDatabase } from './managed-database';

let directory: string;
let key: string | undefined;
beforeEach(() => {
  key = process.env.PRAMAAN_API_KEY;
  process.env.PRAMAAN_API_KEY = 'dummy-offline';
  mkdirSync(resolve('../../.scratch'), { recursive: true });
  directory = mkdtempSync(resolve('../../.scratch/database-'));
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
it('persists the one-time credentials privately and reuses them without provisioning again', async () => {
  const result = {
    status: 'ready',
    created: true,
    connectionString: 'postgresql://owner:private@database.test/app',
    directConnectionString: 'postgresql://owner:private@direct.test/app',
  };
  const call = vi.fn(async () => result);
  setPramaanClientForTests({ call } as never);
  expect(await provisionManagedDatabase(directory)).toEqual({
    connectionString: result.connectionString,
    directConnectionString: result.directConnectionString,
  });
  expect(await provisionManagedDatabase(directory)).toEqual({
    connectionString: result.connectionString,
    directConnectionString: result.directConnectionString,
  });
  expect(call).toHaveBeenCalledOnce();
  expect(statSync(resolve(directory, 'database.json')).mode & 0o777).toBe(0o600);
});
it('falls back only on unavailable and prints one plain line without secrets', async () => {
  const call = vi.fn(async () => {
    throw { code: 'upstream_unavailable' };
  });
  setPramaanClientForTests({ call } as never);
  const notify = vi.fn();
  expect(await provisionManagedDatabase(directory, notify)).toBeUndefined();
  expect(notify).toHaveBeenCalledExactlyOnceWith('Managed database is not available yet; using the local database.');
});
it('does not provision without a key', async () => {
  delete process.env.PRAMAAN_API_KEY;
  const call = vi.fn();
  setPramaanClientForTests({ call } as never);
  expect(await provisionManagedDatabase(directory)).toBeUndefined();
  expect(call).not.toHaveBeenCalled();
});
it('blocks uncertain provisioning retries instead of losing one-time credentials', async () => {
  const call = vi.fn(async () => {
    throw { code: 'upstream_timeout' };
  });
  setPramaanClientForTests({ call } as never);
  await expect(provisionManagedDatabase(directory)).rejects.toThrow('could not be confirmed');
  expect(JSON.parse(readFileSync(resolve(directory, 'database-attempt.json'), 'utf8'))).toHaveProperty('attempt');
  await expect(provisionManagedDatabase(directory)).rejects.toThrow('needs review');
  expect(call).toHaveBeenCalledOnce();
});
it('does not substitute local storage when an existing managed database returns no credentials', async () => {
  const call = vi.fn(async () => ({ status: 'ready', created: false }));
  setPramaanClientForTests({ call } as never);
  const notify = vi.fn();
  await expect(provisionManagedDatabase(directory, notify)).rejects.toThrow('could not be confirmed');
  expect(notify).toHaveBeenCalledWith(
    'Managed database setup refused: setup could not be confirmed; check saved settings before retrying.',
  );
  expect(notify.mock.calls.flat().join(' ')).not.toContain('using the local database');
});
