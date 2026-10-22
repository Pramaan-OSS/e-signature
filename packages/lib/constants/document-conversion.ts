import { env } from '../utils/env';
import { APP_DOCUMENT_UPLOAD_SIZE_LIMIT } from './app';
export const DOCUMENT_CONVERSION_MIME_TYPE_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Conversion requires a configured server key. */
export const IS_DOCUMENT_CONVERSION_ENABLED = (): boolean =>
  typeof window === 'undefined' ? Boolean(env('PRAMAAN_API_KEY')) : env('NEXT_PUBLIC_PRAMAAN_ENABLED') === 'true';

/**
 * Returns the mime type -> extensions map that should be passed to the
 * dropzone `accept` config and used for server-side validation.
 *
 * Always includes PDF; only includes DOCX when the conversion feature is
 * enabled.
 */
export const getAllowedUploadMimeTypes = (): Record<string, string[]> => {
  const base: Record<string, string[]> = {
    'application/pdf': ['.pdf'],
  };

  if (IS_DOCUMENT_CONVERSION_ENABLED()) {
    base[DOCUMENT_CONVERSION_MIME_TYPE_DOCX] = ['.docx'];
  }

  return base;
};

export const DOCX_MAX_BYTES = 100_000_000;
export const documentUploadLimit = (type: string) =>
  type === DOCUMENT_CONVERSION_MIME_TYPE_DOCX ? DOCX_MAX_BYTES : APP_DOCUMENT_UPLOAD_SIZE_LIMIT * 1_000_000;
export const documentUploadMaxSize = () =>
  IS_DOCUMENT_CONVERSION_ENABLED()
    ? Math.max(DOCX_MAX_BYTES, documentUploadLimit('application/pdf'))
    : documentUploadLimit('application/pdf');
export const validateDocumentUpload = (file: { type: string; size: number }) =>
  file.size > documentUploadLimit(file.type)
    ? {
        code: file.type === DOCUMENT_CONVERSION_MIME_TYPE_DOCX ? 'docx-too-large' : 'file-too-large',
        message: `File exceeds ${documentUploadLimit(file.type) / 1_000_000} MB.`,
      }
    : null;
export const documentConversionNotice = () =>
  IS_DOCUMENT_CONVERSION_ENABLED()
    ? 'Word files up to 100 MB are converted to PDF. Password-protected files are not supported. Review the converted layout before sending.'
    : 'Word conversion is unavailable. Upload a PDF.';
