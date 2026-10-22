import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { NEXT_PUBLIC_WEBAPP_URL, formatPath } from '../../../constants/app';
import { deleteObject, putObject } from '../../../server-only/pramaan/storage';
import type { StorageProvider, UploadFileInput } from './storage-provider';
const secret = () => {
  const key = process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error('File access requires the app session secret.');
  return key;
};
export function createFileGrant(key: string, action: 'get' | 'put') {
  const payload = Buffer.from(JSON.stringify({ key, action, expires: Date.now() + 10 * 60_000 })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret()).update(payload).digest('base64url');
}
export function readFileGrant(grant: string, action: 'get' | 'put'): string {
  const [payload, signature] = grant.split('.');
  if (!payload || !signature) throw new Error('File access expired.');
  const actual = Buffer.from(signature, 'base64url');
  const expected = createHmac('sha256', secret()).update(payload).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('File access expired.');
  const claim = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (claim.action !== action || claim.expires < Date.now() || typeof claim.key !== 'string' || claim.key.includes('..')) throw new Error('File access expired.');
  return claim.key;
}
export class PramaanStorageProvider implements StorageProvider {
  private url(key: string, action: 'get' | 'put') {
    return { key, url: new URL(formatPath(`/api/private-files?grant=${createFileGrant(key, action)}`), NEXT_PUBLIC_WEBAPP_URL()).toString() };
  }
  async getPresignPostUrl(fileName: string, _contentType: string, userId?: number) { return this.url(`${userId || 'files'}/${randomUUID()}/${fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`, 'put'); }
  async getAbsolutePresignPostUrl(key: string) { return this.url(key, 'put'); }
  async getPresignGetUrl(key: string) { return this.url(key, 'get'); }
  async uploadFile(input: UploadFileInput) {
    const key = `${randomUUID()}/${input.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    await putObject(key, new Uint8Array(input.body), input.type);
    return { key };
  }
  async deleteFile(key: string) { await deleteObject(key); }
}
