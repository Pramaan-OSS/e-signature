import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('.local', { recursive: true, mode: 0o700 });
let text = existsSync('.env') ? readFileSync('.env', 'utf8') : readFileSync('.env.example', 'utf8');
const values = Object.fromEntries(
  text
    .split('\n')
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => {
      const split = line.indexOf('=');
      return [line.slice(0, split), line.slice(split + 1)];
    }),
);
const defaults = {
  NEXTAUTH_SECRET: () => randomBytes(32).toString('hex'),
  NEXT_PRIVATE_ENCRYPTION_KEY: () => randomBytes(32).toString('hex'),
  NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY: () => randomBytes(32).toString('hex'),
  POSTGRES_PASSWORD: () => randomBytes(24).toString('hex'),
};
for (const [key, generate] of Object.entries(defaults)) {
  if (values[key]) {
    continue;
  }
  const value = generate();
  values[key] = value;
  if (new RegExp(`^${key}=.*$`, 'm').test(text)) {
    text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  } else {
    text += `\n${key}=${value}\n`;
  }
}
writeFileSync('.env', text, { mode: 0o600 });
chmodSync('.env', 0o600);
if (!existsSync('.local/signing.p12')) {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      '.local/signing.key',
      '-out',
      '.local/signing.crt',
      '-days',
      '365',
      '-subj',
      '/CN=e-sign local development',
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'openssl',
    [
      'pkcs12',
      '-export',
      '-inkey',
      '.local/signing.key',
      '-in',
      '.local/signing.crt',
      '-out',
      '.local/signing.p12',
      '-passout',
      'pass:',
    ],
    { stdio: 'ignore' },
  );
  chmodSync('.local/signing.key', 0o600);
  chmodSync('.local/signing.p12', 0o600);
}
console.log('Private local settings and signing certificate are ready.');
if (!values.PRAMAAN_API_KEY) {
  console.log('Add PRAMAAN_API_KEY to .env');
}
