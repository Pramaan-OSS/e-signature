import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setPramaanClientForTests } from '../packages/lib/server-only/pramaan';
import { provisionManagedAuth } from '../packages/lib/server-only/pramaan/managed-auth';
import { provisionManagedDatabase } from '../packages/lib/server-only/pramaan/managed-database';
import { startupRefusal } from '../packages/lib/server-only/pramaan/runtime-action-key';

try {
  if (process.env.E_SIGN_FAKE === '1') {
    process.env.NODE_ENV = 'test';
    const { fakePramaan } = await import('./testing/fake-pramaan');
    setPramaanClientForTests(fakePramaan());
  }
  process.env.E_SIGN_RUNTIME_DIR ||= resolve('.runtime', process.env.E_SIGN_FAKE === '1' ? 'fake' : 'managed');
  try {
    await provisionManagedAuth(
      process.env.E_SIGN_RUNTIME_DIR,
      process.env.NEXT_PUBLIC_WEBAPP_URL || 'http://localhost:3012',
    );
  } catch (error) {
    console.log(`${startupRefusal(error, 'sign-in')} Local sign-in remains available.`);
  }
  const database = await provisionManagedDatabase(process.env.E_SIGN_RUNTIME_DIR);
  if (database) {
    process.env.NEXT_PRIVATE_DATABASE_URL = database.connectionString;
    process.env.NEXT_PRIVATE_DIRECT_DATABASE_URL = database.directConnectionString;
  }
  const migration = spawnSync(
    process.execPath,
    [
      resolve('node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      resolve('packages/prisma/schema.prisma'),
    ],
    { encoding: 'utf8', env: process.env },
  );
  if (migration.status !== 0) {
    throw new Error('Database setup failed. Check the saved connection settings.');
  }
  console.log('Database migrations ready.');
  const child =
    process.env.E_SIGN_FAKE === '1'
      ? spawn(process.execPath, ['--import', 'tsx', 'scripts/testing/start-server.mjs'], {
          stdio: 'inherit',
          env: { ...process.env, E_SIGN_TEST_PRESERVE_KEY: '1' },
        })
      : spawn(process.execPath, ['build/server/main.js'], {
          cwd: resolve('apps/remix'),
          stdio: 'inherit',
          env: { ...process.env, NODE_ENV: 'production' },
        });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('error', () => process.exit(1));
  child.on('exit', (status) => process.exit(status ?? 1));
} catch {
  console.error('Managed startup could not be completed. Check the saved settings before retrying.');
  process.exit(1);
}
