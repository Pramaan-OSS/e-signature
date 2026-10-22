import { extractionSchemas } from '../packages/lib/server-only/pramaan/extraction-schemas';
import { assertSupportedSchema } from '../packages/lib/server-only/pramaan/json-schema';

for (const [name, schema] of Object.entries(extractionSchemas)) {
  assertSupportedSchema(schema, name, 8000);
  console.log(`Schema ${name}: supported.`);
}
