import { PDFDocument } from '@cantoo/pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import { setPramaanClientForTests } from '../pramaan';
import { executeAction } from './actions';

afterEach(() => setPramaanClientForTests(undefined));
it('renders a Buffer-backed signing document before uploading the signature image', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  const bytes = Buffer.from(await pdf.save());
  const upload = vi.fn(async (image: Uint8Array, mime: string, kind: string) => {
    expect(Buffer.from(image).subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(mime).toBe('image/jpeg');
    expect(kind).toBe('image');
    return { fileId: 'stored-image', url: 'https://files.test/image' };
  });
  const call = vi.fn(async () => ({ signatures: [] }));
  setPramaanClientForTests({ files: { upload }, call } as never);
  await expect(executeAction(
    { action: 'extract-signatures', consent: true, operationId: crypto.randomUUID(), envelopeId: 'owned' },
    { envelope: async () => ({ documents: [{ bytes }] }) } as never,
  )).resolves.toEqual({ pages: [{ signatures: [] }], truncated: false });
  expect(upload).toHaveBeenCalledOnce();
  expect(call).toHaveBeenCalledWith('document.signature.extract', { file: 'stored-image', limit: 10 },
    { idempotencyKey: expect.stringMatching(/:page:1$/) });
});
