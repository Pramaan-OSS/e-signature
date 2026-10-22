import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

test('fills missing secrets, preserves configured values and reuses the local certificate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'e-sign-setup-'));
  try {
    copyFileSync('.env.example', join(directory, '.env.example'));
    writeFileSync(
      join(directory, '.env'),
      'PRAMAAN_API_KEY=dummy-offline\nNEXTAUTH_SECRET=keep-existing\nNEXT_PRIVATE_ENCRYPTION_KEY=\n',
    );
    const run = () =>
      execFileSync(process.execPath, [resolve('scripts/setup-local.mjs')], { cwd: directory, encoding: 'utf8' });
    const output = run();
    const first = readFileSync(join(directory, '.env'), 'utf8');
    assert.match(first, /NEXTAUTH_SECRET=keep-existing/);
    for (const key of ['NEXT_PRIVATE_ENCRYPTION_KEY', 'NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY']) {
      assert.match(first, new RegExp(`${key}=[a-f0-9]{64}`));
    }
    assert.match(first, /POSTGRES_PASSWORD=[a-f0-9]{48}/);
    assert.equal(statSync(join(directory, '.env')).mode & 0o777, 0o600);
    const certificate = readFileSync(join(directory, '.local/signing.p12'));
    assert.ok(!output.includes('dummy-offline'));
    run();
    assert.equal(readFileSync(join(directory, '.env'), 'utf8'), first);
    assert.deepEqual(readFileSync(join(directory, '.local/signing.p12')), certificate);
    writeFileSync(join(directory, '.env'), first.replace('PRAMAAN_API_KEY=dummy-offline', 'PRAMAAN_API_KEY='));
    assert.match(run(), /Add PRAMAAN_API_KEY to .env/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
