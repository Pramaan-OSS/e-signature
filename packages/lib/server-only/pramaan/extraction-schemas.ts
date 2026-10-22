import { zodToJsonSchema } from 'zod-to-json-schema';
import { ZSubmitDetectedFieldsInputSchema } from '../ai/envelope/detect-fields/schema';
import { ZDetectedRecipientsSchema } from '../ai/envelope/detect-recipients/schema';
import { normalizeSchema } from './json-schema';
export const extractionValidators = {
  'field-detection': ZSubmitDetectedFieldsInputSchema,
  'recipient-detection': ZDetectedRecipientsSchema,
} as const;
export type ExtractionSchemaName = keyof typeof extractionValidators;
// This runs at import/startup and in the build check. An unrepresentable field rule stops the build.
export const extractionSchemas = Object.fromEntries(
  Object.entries(extractionValidators).map(([name, validator]) => [
    name,
    normalizeSchema({ ...zodToJsonSchema(validator, { $refStrategy: 'none' }), title: name }, name, 8000),
  ]),
) as Record<ExtractionSchemaName, Record<string, unknown>>;
