import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { fakePramaan } from '../../../../scripts/testing/fake-pramaan';
import { callPramaan, setPramaanClientForTests } from '../pramaan';
import { extractDocument } from './extract';
import { extractionSchemas, extractionValidators } from './extraction-schemas';
import { assertSupportedSchema, normalizeSchema, preparePramaanSchemas } from './json-schema';

const object = (extra: Record<string, unknown> = {}) => ({
  type: 'object',
  properties: { value: { type: 'string' } },
  ...extra,
});
const call = vi.fn(async (id: string, input: unknown) => {
  preparePramaanSchemas(id, input, false);
  return { data: { recipients: [] }, truncated: false };
});
beforeEach(() => {
  vi.stubEnv('PRAMAAN_API_KEY', 'test-only');
  call.mockClear();
  setPramaanClientForTests({ call } as never);
});
afterEach(() => {
  setPramaanClientForTests(undefined);
  vi.unstubAllEnvs();
});
it('checks every schema the product sends, preserving constraints while removing the generated marker', () => {
  expect(Object.keys(extractionSchemas)).toEqual(['field-detection', 'recipient-detection']);
  for (const [name, validator] of Object.entries(extractionValidators)) {
    const original = zodToJsonSchema(validator, { $refStrategy: 'none' }) as Record<string, unknown>;
    expect(original).toHaveProperty('$schema');
    expect(() => assertSupportedSchema(original, name)).toThrow(`${name} at /$schema`);
    expect(() =>
      assertSupportedSchema(extractionSchemas[name as keyof typeof extractionSchemas], name, 8000),
    ).not.toThrow();
    const { $schema, ...rest } = original;
    expect(extractionSchemas[name as keyof typeof extractionSchemas]).toEqual({ ...rest, title: name });
  }
});
it('normalizes only schema keywords, without touching property names or annotation values', () => {
  const input = object({
    $schema: 'draft',
    properties: { format: { type: 'string', format: 'email' }, $schema: { type: 'string' } },
    default: { format: 'unchanged' },
  });
  expect(normalizeSchema(input, 'contacts')).toEqual(
    object({
      properties: { format: { type: 'string' }, $schema: { type: 'string' } },
      default: { format: 'unchanged' },
    }),
  );
  expect(input).toHaveProperty('$schema');
});
it.each([
  'pattern',
  'oneOf',
  'allOf',
  'not',
  'if',
  'then',
  'patternProperties',
  'uniqueItems',
])('refuses %s with schema name and path instead of silently weakening it', (keyword) => {
  expect(() =>
    normalizeSchema(object({ properties: { email: { type: 'string', [keyword]: 'rule' } } }), 'recipient-detection'),
  ).toThrow(`recipient-detection at /properties/email/${keyword}`);
});
it('checks object root, local refs and rejects unresolved or cyclic refs', () => {
  expect(() => normalizeSchema({ type: 'array', items: { type: 'string' } }, 'rows')).toThrow('/type');
  expect(() =>
    assertSupportedSchema(object({ properties: { value: { $ref: 'https://example.test/schema' } } }), 'remote'),
  ).toThrow('/properties/value/$ref');
  expect(() =>
    assertSupportedSchema(object({ properties: { value: { $ref: '#/$defs/missing' } } }), 'missing'),
  ).toThrow('unresolved');
  expect(() => assertSupportedSchema(object({ $defs: { loop: { $ref: '#/$defs/loop' } } }), 'loop')).toThrow(
    'recursive',
  );
  expect(() =>
    assertSupportedSchema(
      object({ $defs: { text: { type: 'string' } }, properties: { value: { $ref: '#/$defs/text' } } }),
      'local',
    ),
  ).not.toThrow();
});
it('enforces depth, nodes, branch, enum and byte limits including exact accepted boundaries', () => {
  let node: any = { type: 'string' };
  for (let i = 0; i < 15; i++) {
    node = { type: 'array', items: node };
  }
  node = object({ properties: { child: node } });
  expect(() => assertSupportedSchema(node, 'deep')).not.toThrow();
  node = { type: 'object', properties: { child: node } };
  expect(() => assertSupportedSchema(node, 'deep')).toThrow('depth 16');
  const properties = Object.fromEntries(Array.from({ length: 255 }, (_, i) => [`p${i}`, { type: 'string' }]));
  expect(() => assertSupportedSchema(object({ properties }), 'nodes')).not.toThrow();
  properties.extra = { type: 'string' };
  expect(() => assertSupportedSchema(object({ properties }), 'nodes')).toThrow('256 nodes');
  expect(() =>
    assertSupportedSchema(object({ anyOf: Array.from({ length: 16 }, () => ({ type: 'object' })) }), 'branches'),
  ).not.toThrow();
  expect(() =>
    assertSupportedSchema(object({ anyOf: Array.from({ length: 17 }, () => ({ type: 'object' })) }), 'branches'),
  ).toThrow('16 branches');
  expect(() =>
    assertSupportedSchema(object({ enum: Array.from({ length: 256 }, (_, i) => i) }), 'choices'),
  ).not.toThrow();
  expect(() => assertSupportedSchema(object({ enum: Array.from({ length: 257 }, (_, i) => i) }), 'choices')).toThrow(
    '256 values',
  );
  expect(() => assertSupportedSchema(object({ description: 'é'.repeat(33000) }), 'bytes')).toThrow('65536 bytes');
  expect(() =>
    preparePramaanSchemas('document.extract', { schema: object({ description: 'x'.repeat(8001) }) }),
  ).toThrow('8000 bytes');
});
it('guards chat tool parameters, response schemas, completion schemas and outcome schema inputs', () => {
  const ready = preparePramaanSchemas('llm.chat', {
    messages: [{ role: 'user', content: 'Find fields' }],
    maxTokens: 64,
    tools: [{ name: 'choose_fields', parameters: object({ $schema: 'draft' }) }],
    jsonSchema: object({ $schema: 'draft' }),
  }) as any;
  expect(ready.tools[0].parameters).not.toHaveProperty('$schema');
  expect(ready.jsonSchema).not.toHaveProperty('$schema');
  expect(() =>
    preparePramaanSchemas('llm.chat', {
      messages: [{ role: 'user', content: 'Find fields' }],
      maxTokens: 64,
      tools: [{ name: 'choose_fields', parameters: object({ pattern: 'x' }) }],
    }),
  ).toThrow('llm.chat.tool.choose_fields.parameters at /pattern');
  expect(() =>
    preparePramaanSchemas('llm.complete', {
      messages: [{ role: 'user', content: 'Find fields' }],
      maxTokens: 64,
      jsonSchema: object({ format: 'ignored' }),
    }),
  ).not.toThrow();
  expect(() => preparePramaanSchemas('outcome:test', { schema: object({ oneOf: [] }) })).toThrow('outcome:test.schema');
});
it('normalizes at the single client boundary before an injected client sees the payload', async () => {
  await callPramaan('document.extract', { content: 'AQ==', schema: object({ $schema: 'draft' }) });
  expect((call.mock.calls[0][1] as any).schema).not.toHaveProperty('$schema');
  await expect(callPramaan('document.extract', { content: 'AQ==', schema: object({ pattern: 'x' }) })).rejects.toThrow(
    'document.extract.schema at /pattern',
  );
  expect(call).toHaveBeenCalledTimes(1);
});
it('the standalone fake refuses unsupported schemas rather than accepting them', async () => {
  await expect(
    fakePramaan().call('document.extract', { content: 'AQ==', schema: object({ $schema: 'draft' }) }),
  ).rejects.toThrow('/$schema');
});
it('extracts valid recipients after a failure and refuses incomplete or invalid results', async () => {
  call.mockRejectedValueOnce({ code: 'invalid_request' });
  await expect(extractDocument(new Uint8Array([1]), 'pdf', 'recipient-detection', 'Read recipients')).rejects.toThrow(
    'invalid_request',
  );
  await expect(extractDocument(new Uint8Array([1]), 'pdf', 'recipient-detection', 'Read recipients')).resolves.toEqual({
    recipients: [],
  });
  call.mockResolvedValueOnce({ data: { recipients: [] }, truncated: true });
  await expect(extractDocument(new Uint8Array([1]), 'pdf', 'recipient-detection', 'Read')).rejects.toThrow(
    'incomplete',
  );
  call.mockResolvedValueOnce({ data: { recipients: [{ name: 5 }] }, truncated: false });
  await expect(extractDocument(new Uint8Array([1]), 'pdf', 'recipient-detection', 'Read')).rejects.toThrow(
    'invalid fields',
  );
});

it.each(['llm.chat', 'llm.complete'])('guards the deployed minimum token budget and message shape for %s', (id) => {
  expect(() => preparePramaanSchemas(id, { messages: [{ role: 'user', content: 'Hello' }], maxTokens: 8 })).toThrow(
    '/maxTokens',
  );
  expect(() => preparePramaanSchemas(id, { prompt: 'Hello', maxTokens: 64 })).toThrow('/messages');
  expect(() =>
    preparePramaanSchemas(id, { messages: [{ role: 'user', content: 'Hello' }], maxTokens: 64 }),
  ).not.toThrow();
});
it('the fake unavailable mode never returns a successful capability result', async () => {
  await expect(
    fakePramaan({ unavailableCapabilities: ['document.convert'] }).call('document.convert', {
      file: 'file_owned',
      targetFormat: 'pdf',
    }),
  ).rejects.toMatchObject({ code: 'upstream_unavailable' });
});
