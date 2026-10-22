import { PDFDocument } from '@cantoo/pdf-lib';
import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';
import { detectFieldsFromPage } from '../ai/envelope/detect-fields/detect-page';
import { setPramaanClientForTests } from '../pramaan';

afterEach(() => setPramaanClientForTests(undefined));
it('sends a real one-page PDF when extraction refuses image inputs', async () => {
  const fields = [{ type: 'SIGNATURE', recipientKey: '', box2d: [100, 100, 200, 400], confidence: 'high' }];
  const call = vi.fn(async (_id, input) => {
    if (input.extension !== 'pdf') {
      throw { code: 'invalid_request', message: 'This input format is not enabled here.' };
    }
    const bytes = Buffer.from(input.content, 'base64');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getSize()).toEqual({ width: 1000, height: 1000 });
    return { data: { fields }, truncated: false };
  });
  setPramaanClientForTests({ call } as never);
  const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#ffffff' } })
    .jpeg()
    .toBuffer();
  expect(await detectFieldsFromPage({ image, pageNumber: 1, recipients: [] })).toEqual(fields);
  expect(call).toHaveBeenCalledOnce();
  expect(call.mock.calls[0][0]).toBe('document.extract');
});
