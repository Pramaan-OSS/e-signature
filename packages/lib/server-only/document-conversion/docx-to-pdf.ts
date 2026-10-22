import { DOCUMENT_CONVERSION_MIME_TYPE_DOCX, DOCX_MAX_BYTES } from '../../constants/document-conversion';
import { AppError } from '../../errors/app-error';
import { callPramaan, downloadPramaanFile, pramaanConfigured, uploadPramaanFile } from '../pramaan';

function fail(code: string, message: string, statusCode = 400): never {
  throw new AppError(code, { message, userMessage: message, statusCode });
}
export function validateDocx(buffer: Buffer) {
  if (!pramaanConfigured()) {
    fail('CONVERSION_SERVICE_UNAVAILABLE', 'Word conversion is unavailable. Upload a PDF.', 503);
  }
  if (buffer.length > DOCX_MAX_BYTES) {
    fail('DOCX_TOO_LARGE', 'Word files cannot exceed 100 MB.');
  }
  if (buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) {
    fail(
      'DOCX_PASSWORD_PROTECTED',
      'Password-protected Word files are not supported. Remove the password or upload a PDF.',
    );
  }
}
function conversionError(error: unknown): never {
  if (error instanceof AppError && error.code !== 'upstream_unavailable') {
    throw error;
  }
  const detail = error as { protectedFile?: boolean; code?: string };
  if (detail?.protectedFile) {
    fail(
      'DOCX_PASSWORD_PROTECTED',
      'Password-protected Word files are not supported. Remove the password or upload a PDF.',
    );
  }
  if (['declined', 'invalid_request'].includes(detail?.code || '')) {
    fail(
      'CONVERSION_FAILED',
      'This Word file was refused. Check that it is valid and not password protected, or upload a PDF.',
    );
  }
  fail('CONVERSION_SERVICE_UNAVAILABLE', 'Word conversion is not available yet. Try later or upload a PDF.', 503);
}
async function pdfResult(file: { url: string; contentType: string; sizeBytes: number }) {
  if (file.contentType !== 'application/pdf' || file.sizeBytes > DOCX_MAX_BYTES) {
    fail('CONVERSION_FAILED', 'The converted PDF is invalid or exceeds 100 MB.');
  }
  const bytes = Buffer.from(await downloadPramaanFile(file.url, DOCX_MAX_BYTES));
  if (bytes.subarray(0, 5).toString() !== '%PDF-') {
    fail('CONVERSION_FAILED', 'The conversion did not return a valid PDF.');
  }
  return bytes;
}
export async function convertDocxToPdf(
  { buffer }: { buffer: Buffer; filename: string },
  _logger?: unknown,
): Promise<Buffer> {
  validateDocx(buffer);
  try {
    const uploaded = await uploadPramaanFile(buffer, DOCUMENT_CONVERSION_MIME_TYPE_DOCX, 'document', DOCX_MAX_BYTES);
    const result = await callPramaan('document.convert', { file: uploaded.fileId, targetFormat: 'pdf' });
    return await pdfResult(result.file);
  } catch (error) {
    return conversionError(error);
  }
}
export async function convertDocxBatch(buffers: Buffer[]): Promise<Buffer[]> {
  buffers.forEach(validateDocx);
  if (buffers.length > 10 || buffers.reduce((sum, buffer) => sum + buffer.length, 0) > DOCX_MAX_BYTES) {
    fail('DOCX_TOO_LARGE', 'A Word conversion batch cannot exceed 10 files or 100 MB total.');
  }
  try {
    const rows = await Promise.all(
      buffers.map(async (buffer, index) => ({
        id: String(index),
        file: (await uploadPramaanFile(buffer, DOCUMENT_CONVERSION_MIME_TYPE_DOCX, 'document', DOCX_MAX_BYTES)).fileId,
        targetFormat: 'pdf' as const,
      })),
    );
    const result = await callPramaan('document.convert-bulk', { rows });
    return await Promise.all(
      rows.map(async ({ id }) => {
        const matches = result.results?.filter((row) => row.id === id);
        const row = matches?.length === 1 ? matches[0] : undefined;
        if (/password[- ]protected|encrypted/i.test(row?.error?.message || '')) {
          fail(
            'DOCX_PASSWORD_PROTECTED',
            'Password-protected Word files are not supported. Remove the password or upload a PDF.',
          );
        }
        if (row?.error?.code === 'upstream_unavailable') {
          fail(
            'CONVERSION_SERVICE_UNAVAILABLE',
            'Word conversion is not available yet. Try later or upload a PDF.',
            503,
          );
        }
        if (!row?.found || !row.file || row.error) {
          fail(
            'CONVERSION_FAILED',
            'A Word file could not be converted. Check that it is valid and not password protected, or upload a PDF.',
          );
        }
        return pdfResult(row.file);
      }),
    );
  } catch (error) {
    return conversionError(error);
  }
}
