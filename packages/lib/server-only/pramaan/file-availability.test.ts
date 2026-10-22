import { afterEach, expect, it, vi } from 'vitest';
import { setPramaanClientForTests, uploadPramaanFile } from '../pramaan';
import { isStorageRefused, putObject } from './storage';

afterEach(() => {
  setPramaanClientForTests(undefined);
  vi.unstubAllEnvs();
});
it.each([
  'not_found',
  'upstream_unavailable',
])('shows unavailable when platform file storage refuses %s', async (code) => {
  const call = vi.fn();
  setPramaanClientForTests({
    call,
    files: {
      upload: async () => {
        throw { code, message: 'Private deployment detail' };
      },
    },
  } as never);
  await expect(uploadPramaanFile(new Uint8Array([1]), 'application/pdf')).rejects.toMatchObject({
    code: 'upstream_unavailable',
    effect: 'none',
    message: expect.stringContaining('not available yet'),
  });
  expect(call).not.toHaveBeenCalled();
});
it('keeps the local storage fallback available after a refused file upload', async () => {
  vi.stubEnv('PRAMAAN_API_KEY', 'test');
  const call = vi.fn();
  setPramaanClientForTests({
    call,
    files: {
      upload: async () => {
        throw { code: 'not_found' };
      },
    },
  } as never);
  const error = await putObject('owned.pdf', new Uint8Array([1]), 'application/pdf').catch((e) => e);
  expect(isStorageRefused(error)).toBe(true);
  expect(error.message).toContain('not available yet');
  expect(call).not.toHaveBeenCalled();
});
