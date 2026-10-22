import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOCUMENT_CONVERSION_MIME_TYPE_DOCX,
  DOCX_MAX_BYTES,
  getAllowedUploadMimeTypes,
  validateDocumentUpload,
} from '../../constants/document-conversion';
import { setPramaanClientForTests } from '../pramaan';
import { convertFilesToPdf, convertToPdf } from './index';

const pdf = Buffer.from('%PDF-1.7\nconverted');
const hosted = {
  fileId: 'pdf',
  url: 'https://example.test/files/pdf',
  contentType: 'application/pdf',
  sizeBytes: pdf.length,
  expiresAt: '2030-01-01',
};
const upload = vi.fn(async () => ({ fileId: 'word', url: 'https://example.test/files/word' }));
const download = vi.fn(async () => pdf);
const call = vi.fn(async () => ({ file: hosted }));
const word = (size = 4, bytes = Buffer.from('PK\x03\x04')) => ({
  name: 'agreement.docx',
  type: DOCUMENT_CONVERSION_MIME_TYPE_DOCX,
  size,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer,
});
beforeEach(() => {
  vi.stubEnv('PRAMAAN_API_KEY', 'fake');
  setPramaanClientForTests({ call, files: { upload, download } } as never);
});
afterEach(() => {
  setPramaanClientForTests(undefined);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  call.mockReset();
  call.mockResolvedValue({ file: hosted });
});
describe('Word upload conversion', () => {
  it('stages server-side and returns the converted PDF', async () => {
    expect(await convertToPdf(word())).toEqual(pdf);
    expect(upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      DOCUMENT_CONVERSION_MIME_TYPE_DOCX,
      'document',
      DOCX_MAX_BYTES,
    );
    expect(call).toHaveBeenCalledWith('document.convert', { file: 'word', targetFormat: 'pdf' }, undefined);
    expect(download).toHaveBeenCalledWith(hosted.url, DOCX_MAX_BYTES);
  });
  it('rejects oversized Word before reading or staging', async () => {
    const file = word(DOCX_MAX_BYTES + 1);
    file.arrayBuffer = vi.fn();
    await expect(convertToPdf(file)).rejects.toMatchObject({ code: 'DOCX_TOO_LARGE' });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it('refuses protected Word files before staging', async () => {
    await expect(convertToPdf(word(8, Buffer.from('d0cf11e0a1b11ae1', 'hex')))).rejects.toMatchObject({
      code: 'DOCX_PASSWORD_PROTECTED',
    });
    expect(upload).not.toHaveBeenCalled();
  });
  it('reports upstream protected refusal without exposing its text', async () => {
    call.mockRejectedValueOnce(
      Object.assign(new Error('Password-protected file; private upstream detail'), { code: 'declined' }),
    );
    await expect(convertToPdf(word())).rejects.toMatchObject({
      code: 'DOCX_PASSWORD_PROTECTED',
      message: expect.not.stringContaining('private upstream'),
    });
  });
  it('reports unavailability without creating a PDF', async () => {
    call.mockRejectedValueOnce({ code: 'upstream_unavailable' });
    await expect(convertToPdf(word())).rejects.toMatchObject({
      code: 'CONVERSION_SERVICE_UNAVAILABLE',
      message: expect.stringContaining('not available yet'),
    });
    expect(download).not.toHaveBeenCalled();
  });
  it('keeps Word off without a key', async () => {
    vi.stubEnv('PRAMAAN_API_KEY', '');
    expect(getAllowedUploadMimeTypes()).not.toHaveProperty(DOCUMENT_CONVERSION_MIME_TYPE_DOCX);
    await expect(convertToPdf(word())).rejects.toMatchObject({ code: 'CONVERSION_SERVICE_UNAVAILABLE' });
    expect(upload).not.toHaveBeenCalled();
  });
  it('preserves the PDF path without calls', async () => {
    expect(await convertToPdf({ ...word(), type: 'application/pdf' })).toEqual(Buffer.from('PK\x03\x04'));
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects non-PDF conversion output', async () => {
    download.mockResolvedValueOnce(Buffer.from('invalid'));
    await expect(convertToPdf(word())).rejects.toMatchObject({ code: 'CONVERSION_FAILED' });
  });
  it('matches bulk output by caller id rather than order', async () => {
    call.mockResolvedValueOnce({
      results: [
        { id: '1', found: true, file: hosted },
        { id: '0', found: true, file: hosted },
      ],
      summary: { total: 2, found: 2, notFound: 0, failed: 0 },
    } as never);
    expect(await convertFilesToPdf([word(), word()])).toEqual([pdf, pdf]);
    expect(call).toHaveBeenCalledWith(
      'document.convert-bulk',
      {
        rows: [
          { id: '0', file: 'word', targetFormat: 'pdf' },
          { id: '1', file: 'word', targetFormat: 'pdf' },
        ],
      },
      undefined,
    );
  });
  it('refuses an incomplete batch', async () => {
    call.mockResolvedValueOnce({
      results: [
        { id: '0', found: true, file: hosted },
        { id: '1', found: false, error: { code: 'declined', message: 'private' } },
      ],
    } as never);
    await expect(convertFilesToPdf([word(), word()])).rejects.toMatchObject({ code: 'CONVERSION_FAILED' });
  });
  it('reports protected bulk rows without exposing upstream details', async () => {
    call.mockResolvedValueOnce({
      results: [
        { id: '0', found: false, error: { code: 'declined', message: 'Password-protected archive; private detail' } },
      ],
    } as never);
    await expect(convertFilesToPdf([word(), word()])).rejects.toMatchObject({
      code: 'DOCX_PASSWORD_PROTECTED',
      message: expect.not.stringContaining('private detail'),
    });
  });
  it('keeps Word and PDF size limits separate', () => {
    expect(validateDocumentUpload({ type: DOCUMENT_CONVERSION_MIME_TYPE_DOCX, size: DOCX_MAX_BYTES })).toBeNull();
    expect(validateDocumentUpload({ type: DOCUMENT_CONVERSION_MIME_TYPE_DOCX, size: DOCX_MAX_BYTES + 1 })?.code).toBe(
      'docx-too-large',
    );
    expect(validateDocumentUpload({ type: 'application/pdf', size: DOCX_MAX_BYTES })?.code).toBe('file-too-large');
  });
});
