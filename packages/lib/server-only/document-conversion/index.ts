import { AppError } from '@e-sign/lib/errors/app-error';
import type { Logger } from 'pino';

import { DOCUMENT_CONVERSION_MIME_TYPE_DOCX, DOCX_MAX_BYTES } from '../../constants/document-conversion';
import { convertDocxBatch, convertDocxToPdf } from './docx-to-pdf';

// We should work on unifying these later on.
type FileInput = {
  name: string;
  type: string;
  size?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const UNSUPPORTED_USER_MESSAGE = "This file type isn't supported. Please upload a PDF.";

/**
 * Entry point for upload routes. Returns a PDF buffer for any supported
 * input file:
 *
 * - PDF in → PDF out (no conversion, no network call).
 * - DOCX in → server-side conversion followed by the existing PDF pipeline.
 * - Any other mime type → throws `UNSUPPORTED_FILE_TYPE`.
 *
 * To support new source formats (PowerPoint, HTML, ...), add a new
 * `<format>-to-pdf.ts` sibling and dispatch to it from here.
 */
export const convertToPdf = async (file: FileInput, logger?: Logger): Promise<Buffer> => {
  if (file.type === 'application/pdf') {
    return Buffer.from(await file.arrayBuffer());
  }

  if (file.type === DOCUMENT_CONVERSION_MIME_TYPE_DOCX) {
    if (file.size !== undefined && file.size > DOCX_MAX_BYTES) {
      throw new AppError('DOCX_TOO_LARGE', {
        message: 'Word files cannot exceed 100 MB.',
        userMessage: 'Word files cannot exceed 100 MB.',
        statusCode: 400,
      });
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    return convertDocxToPdf({ buffer, filename: file.name }, logger);
  }

  throw new AppError('UNSUPPORTED_FILE_TYPE', {
    message: `Unsupported file type: ${file.type}`,
    userMessage: UNSUPPORTED_USER_MESSAGE,
    statusCode: 400,
  });
};

export async function convertFilesToPdf(files: FileInput[], logger?: Logger): Promise<Buffer[]> {
  const wordFiles = files.filter((file) => file.type === DOCUMENT_CONVERSION_MIME_TYPE_DOCX);
  const total = wordFiles.reduce((sum, file) => sum + (file.size ?? DOCX_MAX_BYTES), 0);
  if (wordFiles.length < 2 || wordFiles.length > 10 || total > DOCX_MAX_BYTES) {
    return Promise.all(files.map((file) => convertToPdf(file, logger)));
  }
  const buffers = await Promise.all(wordFiles.map(async (file) => Buffer.from(await file.arrayBuffer())));
  const converted = await convertDocxBatch(buffers);
  let index = 0;
  return Promise.all(
    files.map((file) =>
      file.type === DOCUMENT_CONVERSION_MIME_TYPE_DOCX ? converted[index++] : convertToPdf(file, logger),
    ),
  );
}
