import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export type UploadSnapshot = {
  attempt: string;
  digest: string;
  size: number;
  contentType: string;
  phase: 'uploading' | 'completing' | 'done' | 'aborting' | 'aborted';
  ref?: string;
  parts: Record<string, { digest: string; size: number; fileId?: string; confirmed: boolean }>;
};
export interface MultipartJournal {
  acquire(id: string, bucket: string, path: string): Promise<UploadSnapshot | undefined>;
  save(id: string, snapshot: UploadSnapshot, bytes?: Uint8Array): Promise<void>;
  release(id: string): Promise<void>;
  cached(bucket: string, path: string): Promise<{ bytes: Uint8Array; digest: string } | undefined>;
  remove(bucket: string, path: string): Promise<void>;
}
export class StorageUploadBusy extends Error {
  constructor() {
    super('This upload is already in progress. Try again later.');
  }
}
export async function databaseMultipartJournal(): Promise<MultipartJournal> {
  const { prisma } = await import('@e-sign/prisma');
  const token = randomUUID();
  const expires = () => new Date(Date.now() + 30 * 60_000);
  return {
    async acquire(id, bucket, path) {
      await prisma.multipartStorageUpload.upsert({ where: { id }, create: { id, bucket, path }, update: {} });
      const claim = await prisma.multipartStorageUpload.updateMany({
        where: { id, OR: [{ leaseToken: null }, { leaseExpiresAt: { lt: new Date() } }] },
        data: { leaseToken: token, leaseExpiresAt: expires() },
      });
      if (claim.count !== 1) {
        throw new StorageUploadBusy();
      }
      const row = await prisma.multipartStorageUpload.findUniqueOrThrow({ where: { id } });
      return Object.keys(row.snapshot as object).length ? (row.snapshot as unknown as UploadSnapshot) : undefined;
    },
    async save(id, snapshot, bytes) {
      const result = await prisma.multipartStorageUpload.updateMany({
        where: { id, leaseToken: token },
        data: {
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          leaseExpiresAt: expires(),
          bytes: bytes ? Buffer.from(bytes) : snapshot.phase === 'done' ? undefined : null,
        },
      });
      if (result.count !== 1) {
        throw new StorageUploadBusy();
      }
    },
    async release(id) {
      await prisma.multipartStorageUpload.updateMany({
        where: { id, leaseToken: token },
        data: { leaseToken: null, leaseExpiresAt: null },
      });
    },
    async cached(bucket, path) {
      const row = await prisma.multipartStorageUpload.findUnique({ where: { bucket_path: { bucket, path } } });
      const snapshot = row?.snapshot as unknown as UploadSnapshot | undefined;
      return row?.bytes && snapshot?.phase === 'done' ? { bytes: row.bytes, digest: snapshot.digest } : undefined;
    },
    async remove(bucket, path) {
      await prisma.multipartStorageUpload.deleteMany({ where: { bucket, path } });
    },
  };
}
