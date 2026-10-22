import { createHash, randomUUID } from 'node:crypto';
import { callPramaan, deletePramaanFile, downloadPramaanFile, pramaanConfigured, uploadPramaanFile } from '../pramaan';
import { databaseMultipartJournal, type MultipartJournal } from './multipart-journal';

const bucket = () => process.env.PRAMAAN_STORAGE_BUCKET || 'e-sign';
export const SMALL_OBJECT_MAX = 25_000_000;
export const MULTIPART_MAX = 1_073_741_824;
export const PART_BYTES = 8_388_608;
const digestOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const refusalCodes = new Set([
  'declined',
  'invalid_request',
  'forbidden',
  'unauthorized',
  'spend_cap_reached',
  'connection_required',
  'not_configured',
  'missing_connection',
  'not_found',
  'upstream_unavailable',
]);
export const isStorageRefused = (error: unknown) =>
  Boolean(error && typeof error === 'object' && 'storageRefused' in error && error.storageRefused === true);
let testJournal: MultipartJournal | undefined;
export function setMultipartJournalForTests(journal?: MultipartJournal) {
  if (Reflect.get(process.env, 'NODE_ENV') !== 'test') {
    throw new Error('Test journals require test mode.');
  }
  testJournal = journal;
}
const journal = () => (testJournal ? Promise.resolve(testJournal) : databaseMultipartJournal());
export async function putObject(path: string, bytes: Uint8Array, contentType: string, overwrite = false) {
  if (!pramaanConfigured()) {
    throw Object.assign(new Error('Storage is not configured. Keep this file in the database.'), {
      storageRefused: true,
    });
  }
  if (bytes.byteLength > SMALL_OBJECT_MAX) {
    return putMultipartObject(path, bytes, contentType, undefined, overwrite);
  }
  const digest = digestOf(bytes);
  try {
    const file = await uploadPramaanFile(bytes, contentType);
    await callPramaan(
      'storage.object.put',
      { bucket: bucket(), path, fileId: file.fileId, contentType, overwrite },
      { idempotencyKey: `file-put:${path}:${digest}` },
    );
    if (overwrite) {
      await (await journal()).remove(bucket(), path);
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    throw Object.assign(
      new Error(
        code === 'upstream_unavailable'
          ? 'File storage is not available yet. Keep this file in the database.'
          : 'File could not be stored.',
      ),
      { storageRefused: refusalCodes.has(code || ''), code, effect: (error as { effect?: string })?.effect },
    );
  }
}
export async function getObject(path: string): Promise<Uint8Array> {
  const cache = await (await journal()).cached(bucket(), path);
  if (cache) {
    if (digestOf(cache.bytes) !== cache.digest) {
      throw new Error('The stored document failed its integrity check.');
    }
    return cache.bytes;
  }
  const result = await callPramaan('storage.object.get', { bucket: bucket(), path });
  if (result.content) {
    return Buffer.from(result.content, 'base64');
  }
  if (!result.file?.url) {
    throw new Error('File contents are unavailable.');
  }
  return downloadPramaanFile(result.file.url);
}
export async function deleteObject(path: string) {
  const result = await callPramaan(
    'storage.object.delete',
    { bucket: bucket(), paths: [path] },
    { idempotencyKey: `file-delete:${path}` },
  );
  await (await journal()).remove(bucket(), path);
  return result;
}
export async function putMultipartObject(
  path: string,
  bytes: Uint8Array,
  contentType: string,
  _operationId?: string,
  overwrite = false,
) {
  if (!pramaanConfigured()) {
    throw Object.assign(new Error('Storage is not configured. Keep this file in the database.'), {
      storageRefused: true,
    });
  }
  if (bytes.byteLength > MULTIPART_MAX || !bytes.byteLength) {
    throw Object.assign(new Error('Multipart storage accepts files up to 1 GiB.'), { storageRefused: true });
  }
  const store = await journal();
  const targetBucket = bucket();
  const id = createHash('sha256')
    .update(JSON.stringify([targetBucket, path]))
    .digest('hex');
  const digest = digestOf(bytes);
  let saved = await store.acquire(id, targetBucket, path);
  let completed = false;
  let mismatch = false;
  let mayAbort = false;
  const persist = async () => {
    await store.save(id, saved!);
  };
  const cleanup = async () => {
    for (const part of Object.values(saved!.parts)) {
      if (part.fileId) {
        await deletePramaanFile(part.fileId);
        delete part.fileId;
        await persist();
      }
    }
  };
  try {
    if (saved && (saved.digest !== digest || saved.size !== bytes.byteLength || saved.contentType !== contentType)) {
      if (saved.phase !== 'done' && saved.phase !== 'aborted') {
        throw new Error('The upload input changed. Finish or discard the previous upload first.');
      }
      if (!overwrite) {
        throw new Error('A different file already uses this storage path.');
      }
      saved = undefined;
    }
    if (saved?.phase === 'done') {
      const cache = await store.cached(targetBucket, path);
      if (!cache || digestOf(cache.bytes) !== digest) {
        throw new Error('The stored document failed its integrity check.');
      }
      return { stored: true, path, resumed: true };
    }
    mayAbort = true;
    if (saved?.phase === 'aborting' && saved.ref) {
      await callPramaan(
        'storage.upload.abort',
        { ref: saved.ref, confirm: true },
        { idempotencyKey: `${saved.attempt}:abort` },
      );
      saved.phase = 'aborted';
      await persist();
    }
    if (!saved || saved.phase === 'aborted') {
      saved = { attempt: randomUUID(), digest, size: bytes.byteLength, contentType, phase: 'uploading', parts: {} };
      await persist();
    }
    if (!saved.ref) {
      const created = await callPramaan(
        'storage.upload.create',
        { bucket: targetBucket, path, contentType },
        { idempotencyKey: `${saved.attempt}:create` },
      );
      if (created.bucket !== targetBucket || created.path !== path || !created.ref) {
        throw new Error('Storage returned a different upload target.');
      }
      saved.ref = created.ref;
      await persist();
    }
    const ref = saved.ref;
    if (saved.phase !== 'completing') {
      const remote = new Map<number, number>();
      let cursor: string | undefined;
      const cursors = new Set<string>();
      do {
        const page = await callPramaan('storage.upload.parts.list', {
          ref,
          limit: 1000,
          ...(cursor ? { cursor } : {}),
        });
        for (const part of page.results) {
          if (remote.has(part.partNumber) || part.partNumber > Math.ceil(bytes.length / PART_BYTES)) {
            throw new Error('Stored upload parts do not match this file.');
          }
          remote.set(part.partNumber, part.sizeBytes);
        }
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor)) {
          throw new Error('Stored upload parts could not be listed.');
        }
        if (cursor) {
          cursors.add(cursor);
        }
      } while (cursor);
      for (let offset = 0, number = 1; offset < bytes.length; offset += PART_BYTES, number++) {
        const partBytes = bytes.subarray(offset, Math.min(offset + PART_BYTES, bytes.length));
        const digest = digestOf(partBytes);
        let part = saved.parts[number];
        if (part?.digest === digest && part.size === partBytes.length && remote.get(number) === partBytes.length) {
          part.confirmed = true;
          await persist();
        } else {
          if (!part || part.digest !== digest || part.size !== partBytes.length) {
            part = { digest, size: partBytes.length, confirmed: false };
          }
          saved.parts[number] = part;
          if (!part.fileId) {
            const staged = await uploadPramaanFile(partBytes, 'application/octet-stream', 'part', PART_BYTES);
            part.fileId = staged.fileId;
            await persist();
          }
          for (let retry = 0; retry < 2; retry++) {
            try {
              const stored = await callPramaan(
                'storage.upload.part.put',
                { ref, partNumber: number, fileId: part.fileId },
                { idempotencyKey: `${saved.attempt}:part:${number}:${part.fileId}:${digest}` },
              );
              if (stored.partNumber !== number || stored.sizeBytes !== partBytes.length) {
                throw new Error('Stored upload part failed its size check.');
              }
              part.confirmed = true;
              await persist();
              break;
            } catch (error) {
              if (
                retry ||
                !['upstream_unavailable', 'upstream_timeout', 'unavailable'].includes(
                  (error as { code?: string }).code || '',
                )
              ) {
                throw error;
              }
            }
          }
        }
        if (part.fileId) {
          await deletePramaanFile(part.fileId);
          delete part.fileId;
          await persist();
        }
      }
      if (
        Object.values(saved.parts).reduce((sum, part) => sum + (part.confirmed ? part.size : 0), 0) !== bytes.length
      ) {
        throw new Error('The upload parts failed their total size check.');
      }
      saved.phase = 'completing';
      await persist();
    }
    const result = await callPramaan(
      'storage.upload.complete',
      { ref },
      { idempotencyKey: `${saved.attempt}:complete` },
    );
    completed = true;
    const head = await callPramaan('storage.object.head', { bucket: targetBucket, path });
    if (
      result.bucket !== targetBucket ||
      result.path !== path ||
      result.sizeBytes !== bytes.length ||
      head.bucket !== targetBucket ||
      head.path !== path ||
      head.sizeBytes !== bytes.length ||
      (head.contentType && head.contentType !== contentType)
    ) {
      mismatch = true;
      throw new Error('The completed file failed its integrity check.');
    }
    saved.phase = 'done';
    await store.save(id, saved, bytes);
    return { stored: true, path, resumed: Object.keys(saved.parts).length > 0 };
  } catch (error) {
    if (!mayAbort) {
      throw error;
    }
    const code = (error as { code?: string })?.code;
    let discarded = !saved?.ref;
    if (saved?.ref) {
      saved.phase = 'aborting';
      await persist();
      try {
        await callPramaan(
          'storage.upload.abort',
          { ref: saved.ref, confirm: true },
          { idempotencyKey: `${saved.attempt}:abort` },
        );
        discarded = true;
      } catch {
        discarded = completed;
      }
      if (mismatch) {
        await callPramaan(
          'storage.object.delete',
          { bucket: targetBucket, paths: [path] },
          { idempotencyKey: `${saved.attempt}:discard-mismatch` },
        );
      }
      if (discarded) {
        await cleanup();
        saved.phase = 'aborted';
        await persist();
      }
    }
    throw Object.assign(
      new Error(
        mismatch
          ? 'The completed file failed its integrity check.'
          : 'The upload could not finish. Its saved progress will be checked before retrying.',
      ),
      { storageRefused: discarded && refusalCodes.has(code || '') },
    );
  } finally {
    await store.release(id);
  }
}
