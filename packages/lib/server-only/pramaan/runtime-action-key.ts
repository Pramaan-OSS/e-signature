import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Save before calling; retries of the same pending operation reuse its identifier. */
export function runtimeActionKey(directory: string, operation: string, input: unknown = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = join(directory, `${operation}-key.json`);
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  if (existsSync(path)) {
    chmodSync(path, 0o600);
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    if (saved.fingerprint === fingerprint) {
      if (typeof saved.key !== 'string' || !/^[a-z-]+-[a-f0-9-]{36}$/.test(saved.key)) {
        throw new Error('Saved startup request identifier needs review.');
      }
      return saved.key as string;
    }
  }
  const key = `${operation}-${randomUUID()}`;
  const temporary = `${path}.new`;
  writeFileSync(temporary, JSON.stringify({ key, fingerprint }), { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  return key;
}

export function startupRefusal(error: unknown, feature: 'sign-in' | 'database') {
  const value = error && typeof error === 'object' ? (error as { code?: string; reason?: string }) : {};
  const reason =
    value.reason === 'idempotency_key_required'
      ? 'a saved request identifier is required'
      : value.code === 'invalid_request'
        ? 'the startup request was rejected'
        : value.code === 'unauthorized' || value.code === 'forbidden'
          ? 'access was refused'
          : value.code === 'rate_limited'
            ? 'too many requests; try later'
            : 'setup could not be confirmed; check saved settings before retrying';
  return `Managed ${feature} setup refused: ${reason}.`;
}
