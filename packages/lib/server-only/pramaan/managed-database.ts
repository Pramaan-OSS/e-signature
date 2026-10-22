import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callPramaan, pramaanConfigured } from '../pramaan';
import { runtimeActionKey, startupRefusal } from './runtime-action-key';

function save(path: string, value: unknown) {
  const temporary = `${path}.new`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}
function connection(value: unknown): string {
  if (typeof value !== 'string' || /\s/.test(value)) {
    throw new Error('Managed database settings are incomplete.');
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'postgresql:' || !url.username || !url.password || !url.hostname || url.hash) {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error('Managed database settings are incomplete.');
  }
}
export async function provisionManagedDatabase(directory: string, notify: (message: string) => void = console.log) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = join(directory, 'database.json');
  const pending = join(directory, 'database-attempt.json');
  if (existsSync(path)) {
    chmodSync(path, 0o600);
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    return {
      connectionString: connection(saved.connectionString),
      directConnectionString: connection(saved.directConnectionString),
    };
  }
  if (!pramaanConfigured()) {
    return undefined;
  }
  if (existsSync(pending)) {
    throw new Error(
      'Managed database setup needs review before retrying. Restore saved credentials or request an approved rotation.',
    );
  }
  const attempt = runtimeActionKey(directory, 'managed-database');
  save(pending, { attempt });
  try {
    const result = await callPramaan('db.postgres.provision', {}, { idempotencyKey: attempt });
    if (!['ready', 'paused'].includes(result.status)) {
      throw new Error('Managed database is not ready.');
    }
    const saved = {
      connectionString: connection(result.connectionString),
      directConnectionString: connection(result.directConnectionString),
    };
    save(path, saved);
    unlinkSync(pending);
    return saved;
  } catch (error) {
    if ((error as { code?: string }).code === 'upstream_unavailable') {
      unlinkSync(pending);
      notify('Managed database is not available yet; using the local database.');
      return undefined;
    }
    notify(startupRefusal(error, 'database'));
    throw new Error('Managed database setup could not be confirmed. Check saved settings before retrying.');
  }
}
