import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { putFileServerSide } from '../../universal/upload/put-file.server';
import { setPramaanClientForTests } from '../pramaan';
import type { MultipartJournal, UploadSnapshot } from './multipart-journal';
import {
  getObject,
  isStorageRefused,
  PART_BYTES,
  putMultipartObject,
  putObject,
  setMultipartJournalForTests,
} from './storage';

const bytes = new Uint8Array(25_000_001).fill(7);
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
let snapshot: UploadSnapshot | undefined;
let cache: Uint8Array | undefined;
let released: boolean;
const files = new Map<string, Uint8Array>();
const parts = new Map<number, Uint8Array>();
let stored: Uint8Array;
let fault: 'retry' | 'part' | 'complete' | 'head' | 'refused' | undefined;
let failedOnce: boolean;
const upload = vi.fn(async (data: Uint8Array, _type: string, kind: string) => {
  const fileId = `part_${files.size}_${upload.mock.calls.length}`;
  files.set(fileId, data.slice());
  return { fileId, url: kind === 'part' ? '' : 'https://example.test/files/pdf' };
});
const remove = vi.fn(async (id: string) => {
  files.delete(id);
});
const call = vi.fn(async (id: string, input: Record<string, any>) => {
  if (id === 'storage.upload.create') {
    if (fault === 'refused') {
      throw { code: 'invalid_request' };
    }
    return { bucket: 'e-sign', path: input.path, ref: 'owned_upload' };
  }
  if (id === 'storage.upload.parts.list') {
    return { results: [...parts].map(([partNumber, data]) => ({ partNumber, sizeBytes: data.length })) };
  }
  if (id === 'storage.upload.part.put') {
    if (fault === 'part' || (fault === 'retry' && !failedOnce)) {
      failedOnce = true;
      throw { code: 'upstream_unavailable' };
    }
    const data = files.get(input.fileId)!;
    parts.set(input.partNumber, data.slice());
    return { partNumber: input.partNumber, sizeBytes: data.length };
  }
  if (id === 'storage.upload.complete') {
    stored = Buffer.concat([...parts].sort(([a], [b]) => a - b).map(([, data]) => data));
    return { bucket: 'e-sign', path: 'large.pdf', sizeBytes: stored.length + (fault === 'complete' ? 1 : 0) };
  }
  if (id === 'storage.object.head') {
    return {
      bucket: 'e-sign',
      path: 'large.pdf',
      sizeBytes: stored.length + (fault === 'head' ? 1 : 0),
      contentType: 'application/pdf',
    };
  }
  if (id === 'storage.upload.abort') {
    parts.clear();
    files.clear();
    return { aborted: true };
  }
  if (id === 'storage.object.delete') {
    return { count: 1 };
  }
  if (id === 'storage.object.put') {
    if (fault === 'refused') {
      throw { code: 'declined' };
    }
    return { bucket: 'e-sign', path: input.path, sizeBytes: files.get(input.fileId)!.length };
  }
  throw new Error('Unexpected test call');
});
const journal: MultipartJournal = {
  async acquire() {
    return snapshot && structuredClone(snapshot);
  },
  async save(_id, state, data) {
    snapshot = structuredClone(state);
    if (data) {
      cache = data.slice();
    }
  },
  async release() {
    released = true;
  },
  async cached() {
    return cache && snapshot?.phase === 'done' ? { bytes: cache, digest: snapshot.digest } : undefined;
  },
  async remove() {
    cache = undefined;
  },
};
beforeEach(() => {
  vi.stubEnv('PRAMAAN_API_KEY', 'fake');
  vi.stubEnv('PRAMAAN_STORAGE_BUCKET', 'e-sign');
  snapshot = undefined;
  cache = undefined;
  released = false;
  fault = undefined;
  failedOnce = false;
  files.clear();
  parts.clear();
  vi.clearAllMocks();
  setMultipartJournalForTests(journal);
  setPramaanClientForTests({ call, files: { upload, delete: remove } } as never);
});
afterEach(() => {
  setPramaanClientForTests(undefined);
  setMultipartJournalForTests(undefined);
  vi.unstubAllEnvs();
});
it('stores multiple raw parts, deletes staging and checks completion before retaining its readable copy', async () => {
  expect(await putObject('large.pdf', bytes, 'application/pdf')).toMatchObject({ stored: true });
  expect(upload).toHaveBeenCalledTimes(3);
  for (const args of upload.mock.calls) {
    expect(args.slice(1)).toEqual(['application/octet-stream', 'part', PART_BYTES]);
  }
  expect(call.mock.calls.filter(([id]) => id === 'storage.upload.complete')).toHaveLength(1);
  expect(remove).toHaveBeenCalledTimes(3);
  expect(files.size).toBe(0);
  expect(snapshot?.phase).toBe('done');
  expect(released).toBe(true);
  expect(hash(await getObject('large.pdf'))).toBe(hash(bytes));
  expect(call.mock.calls.some(([id]) => id === 'storage.object.get')).toBe(false);
});
it('retries a failed part with the same staged file and action key', async () => {
  fault = 'retry';
  await putMultipartObject('large.pdf', bytes, 'application/pdf');
  const attempts = call.mock.calls.filter(([id]) => id === 'storage.upload.part.put');
  expect(attempts).toHaveLength(4);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(upload).toHaveBeenCalledTimes(3);
});
it('aborts after exhausted part retries and releases its lease', async () => {
  fault = 'part';
  await expect(putMultipartObject('large.pdf', bytes, 'application/pdf')).rejects.toThrow('could not finish');
  expect(call.mock.calls.filter(([id]) => id === 'storage.upload.part.put')).toHaveLength(2);
  expect(call).toHaveBeenCalledWith(
    'storage.upload.abort',
    { ref: 'owned_upload', confirm: true },
    expect.objectContaining({ idempotencyKey: expect.stringContaining(':abort') }),
  );
  expect(snapshot?.phase).toBe('aborted');
  expect(released).toBe(true);
  expect(cache).toBeUndefined();
});
it.each([
  'complete',
  'head',
] as const)('rejects a %s size mismatch and removes the corrupted remote object', async (failure) => {
  fault = failure;
  await expect(putMultipartObject('large.pdf', bytes, 'application/pdf')).rejects.toThrow('integrity check');
  expect(cache).toBeUndefined();
  expect(call.mock.calls.some(([id]) => id === 'storage.upload.abort')).toBe(true);
  expect(call.mock.calls.some(([id]) => id === 'storage.object.delete')).toBe(true);
});
it('marks a refused creation for database fallback without staging', async () => {
  fault = 'refused';
  let error: unknown;
  try {
    await putMultipartObject('large.pdf', bytes, 'application/pdf');
  } catch (e) {
    error = e;
  }
  expect(isStorageRefused(error)).toBe(true);
  expect(upload).not.toHaveBeenCalled();
  expect(call.mock.calls.some(([id]) => id === 'storage.upload.abort')).toBe(false);
});
it('keeps the database path when storage is refused', async () => {
  vi.stubEnv('NEXT_PUBLIC_UPLOAD_TRANSPORT', 'pramaan');
  fault = 'refused';
  const input = Buffer.from('%PDF-test');
  expect(
    await putFileServerSide({ name: 'test.pdf', type: 'application/pdf', arrayBuffer: async () => input }),
  ).toEqual({ type: 'BYTES_64', data: input.toString('base64') });
});
it('keeps the database path without a key', async () => {
  vi.stubEnv('NEXT_PUBLIC_UPLOAD_TRANSPORT', 'pramaan');
  vi.stubEnv('PRAMAAN_API_KEY', '');
  const input = Buffer.from('%PDF-test');
  expect(
    await putFileServerSide({ name: 'test.pdf', type: 'application/pdf', arrayBuffer: async () => input }),
  ).toEqual({ type: 'BYTES_64', data: input.toString('base64') });
  expect(call).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});
it('resumes a saved upload and skips its confirmed matching part', async () => {
  const first = bytes.subarray(0, PART_BYTES);
  parts.set(1, first);
  snapshot = {
    attempt: 'saved_attempt',
    digest: hash(bytes),
    size: bytes.length,
    contentType: 'application/pdf',
    phase: 'uploading',
    ref: 'owned_upload',
    parts: { '1': { digest: hash(first), size: first.length, confirmed: true } },
  };
  await putMultipartObject('large.pdf', bytes, 'application/pdf');
  expect(upload).toHaveBeenCalledTimes(2);
  expect(call.mock.calls.some(([id]) => id === 'storage.upload.create')).toBe(false);
  expect(
    call.mock.calls.filter(([id]) => id === 'storage.upload.part.put').map(([, input]) => input.partNumber),
  ).toEqual([2, 3]);
});
it('refuses changed input without touching the saved upload', async () => {
  snapshot = {
    attempt: 'saved',
    digest: 'different',
    size: bytes.length,
    contentType: 'application/pdf',
    phase: 'uploading',
    ref: 'owned_upload',
    parts: {},
  };
  await expect(putMultipartObject('large.pdf', bytes, 'application/pdf')).rejects.toThrow('input changed');
  expect(call).not.toHaveBeenCalled();
  expect(snapshot.phase).toBe('uploading');
  expect(released).toBe(true);
});
it('keeps storage.object.put at the 25 MB boundary', async () => {
  await putObject('small.pdf', new Uint8Array(25_000_000), 'application/pdf');
  expect(call.mock.calls.map(([id]) => id)).toEqual(['storage.object.put']);
  expect(upload.mock.calls[0][2]).toBe('document');
});
it('detects corruption of the database copy', async () => {
  await putMultipartObject('large.pdf', bytes, 'application/pdf');
  cache![0] = 99;
  await expect(getObject('large.pdf')).rejects.toThrow('integrity check');
});
