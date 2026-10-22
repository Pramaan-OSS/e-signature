import type { z } from 'zod';
import { callPramaan } from '../pramaan';
import { type ExtractionSchemaName, extractionSchemas, extractionValidators } from './extraction-schemas';
export class DocumentExtractionError extends Error {}
export function requireCompleteExtraction(result: unknown): { data: unknown; truncated: false } {
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    !('data' in result) ||
    !('truncated' in result) ||
    typeof result.truncated !== 'boolean'
  ) {
    throw new DocumentExtractionError('Document extraction returned an invalid result. Try again.');
  }
  if (result.truncated) {
    throw new DocumentExtractionError('Document extraction was incomplete. Try again.');
  }
  if (result.data == null) {
    throw new DocumentExtractionError('Document extraction returned no usable data. Try again.');
  }
  return result as { data: unknown; truncated: false };
}
export async function extractDocument<Name extends ExtractionSchemaName>(
  bytes: Uint8Array,
  extension: string,
  name: Name,
  prompt: string,
): Promise<z.output<(typeof extractionValidators)[Name]>> {
  if (bytes.byteLength > 10 * 1024 * 1024) {
    throw new Error('Document exceeds the extraction limit.');
  }
  const schema = extractionValidators[name];
  const jsonSchema = extractionSchemas[name];
  try {
    const result = requireCompleteExtraction(
      await callPramaan('document.extract', {
        content: Buffer.from(bytes).toString('base64'),
        extension,
        schema: jsonSchema,
        prompt: prompt.slice(0, 2000),
      }),
    );
    const parsed = schema.safeParse(result.data);
    if (!parsed.success) {
      throw new DocumentExtractionError('Document extraction returned invalid fields. Try again.');
    }
    return parsed.data as z.output<(typeof extractionValidators)[Name]>;
  } catch (error) {
    if (error instanceof DocumentExtractionError) {
      throw error;
    }
    const code = (error as { code?: string }).code;
    if (code === 'upstream_unavailable') {
      throw new DocumentExtractionError('Document extraction is not available yet. Try later.');
    }
    throw new DocumentExtractionError(
      `Document extraction failed${code && /^[a-z_]+$/.test(code) ? ` (${code})` : ''}. Try again.`,
    );
  }
}
