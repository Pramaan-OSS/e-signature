import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { callPramaan, pramaanConfigured } from '../pramaan';
import { runtimeActionKey } from './runtime-action-key';

export type ManagedBackend = { authUrl: string; jwksUrl: string; appOrigin: string };
export const managedRuntimeDirectory = () => process.env.E_SIGN_RUNTIME_DIR || resolve('.runtime');
function endpoint(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('Managed sign-in settings are incomplete.');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
    throw new Error('Managed sign-in settings are incomplete.');
  }
  return url.href.replace(/\/$/, '');
}
export function getManagedBackend(directory = managedRuntimeDirectory()): ManagedBackend | undefined {
  if (!pramaanConfigured()) {
    return undefined;
  }
  const path = join(directory, 'auth.json');
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    const appOrigin = new URL(process.env.NEXT_PUBLIC_WEBAPP_URL || 'http://localhost:3012').origin;
    if (saved.appOrigin !== appOrigin) {
      return undefined;
    }
    return { authUrl: endpoint(saved.authUrl), jwksUrl: endpoint(saved.jwksUrl), appOrigin };
  } catch {
    return undefined;
  }
}
export async function provisionManagedAuth(
  directory: string,
  appUrl: string,
  notify: (message: string) => void = console.log,
) {
  if (!pramaanConfigured()) {
    return undefined;
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = join(directory, 'auth.json');
  const app = new URL(appUrl);
  const saved = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  let result: ManagedBackend;
  try {
    const backend =
      saved ||
      (await callPramaan(
        'auth.backend.provision',
        {},
        { idempotencyKey: runtimeActionKey(directory, 'managed-signin') },
      ));
    result = { authUrl: endpoint(backend.authUrl), jwksUrl: endpoint(backend.jwksUrl), appOrigin: app.origin };
    const publicAddress =
      app.protocol === 'https:' &&
      app.hostname.includes('.') &&
      !/(^|\.)(localhost|local)$/.test(app.hostname) &&
      !isIP(app.hostname.replace(/^\[|\]$/g, ''));
    if (publicAddress) {
      if (saved?.appOrigin !== app.origin) {
        const domains = await callPramaan(
          'auth.backend.domains.set',
          { domains: [app.origin] },
          { idempotencyKey: runtimeActionKey(directory, 'managed-domains', { domains: [app.origin] }) },
        );
        if (!domains.allowedDomains.includes(app.origin)) {
          throw new Error('Managed sign-in address could not be confirmed.');
        }
      }
    } else {
      notify('Managed sign-in uses the development address; public domain setup skipped.');
    }
  } catch (error) {
    if ((error as { code?: string }).code !== 'upstream_unavailable') {
      throw error;
    }
    notify('Managed sign-in is not available yet; local sign-in remains available.');
    return undefined;
  }
  const temporary = `${path}.new`;
  writeFileSync(temporary, JSON.stringify(result), { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  const domainKey = join(directory, 'managed-domains-key.json');
  if (existsSync(domainKey)) {
    unlinkSync(domainKey);
  }
  return result;
}
export async function verifyManagedToken(token: string, backend: ManagedBackend) {
  if (token.length > 8192 || token.split('.').length !== 3) {
    throw new Error('Managed sign-in was refused. Try signing in again.');
  }
  const origin = new URL(backend.authUrl).origin;
  const result = await callPramaan('auth.token.verify', {
    token,
    audience: origin,
    authorizedParties: [backend.appOrigin],
  });
  if (!result.valid || !result.userId) {
    throw new Error('Managed sign-in was refused. Try signing in again.');
  }
  // Claims are used only after the platform has checked this exact signed token.
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.sub !== result.userId ||
    claims.iss !== origin ||
    !audience.includes(origin) ||
    typeof claims.exp !== 'number' ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= Date.now()
  ) {
    throw new Error('Managed sign-in was refused. Try signing in again.');
  }
  if (
    typeof claims.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
    claims.email.length > 254 ||
    claims.banned === true
  ) {
    throw new Error('Managed sign-in account details are incomplete.');
  }
  return {
    subject: result.userId,
    issuer: origin,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === 'string' ? claims.name.slice(0, 200) : claims.email.split('@')[0],
    emailVerified: claims.emailVerified === true || claims.email_verified === true,
  };
}
