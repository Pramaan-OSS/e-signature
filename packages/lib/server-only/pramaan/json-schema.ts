type Schema = Record<string, unknown>;
const keys = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'anyOf',
  '$defs',
  '$ref',
  'title',
  'description',
  'default',
  'examples',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
]);
const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const bounds = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
]);
const record = (v: unknown): v is Schema =>
  Boolean(
    v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v)),
  );
const segment = (v: string) => v.replaceAll('~', '~0').replaceAll('/', '~1');
export class PramaanSchemaError extends Error {
  readonly code = 'invalid_request';
  constructor(name: string, path: string, reason: string) {
    super(`Schema ${name} at ${path || '/'}: ${reason}`);
  }
}
function json(value: unknown, seen = new Set<object>(), depth = 0): boolean {
  if (depth > 32) {
    return false;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (!value || typeof value !== 'object' || seen.has(value) || (!record(value) && !Array.isArray(value))) {
    return false;
  }
  seen.add(value);
  const valid = Object.values(value).every((v) => json(v, seen, depth + 1));
  seen.delete(value);
  return valid;
}
function children(node: Schema): [string, unknown][] {
  return [
    ...Object.entries((node.properties || {}) as Schema).map(
      ([k, v]) => [`properties/${segment(k)}`, v] as [string, unknown],
    ),
    ...Object.entries((node.$defs || {}) as Schema).map(([k, v]) => [`$defs/${segment(k)}`, v] as [string, unknown]),
    ...(node.items === undefined ? [] : [['items', node.items] as [string, unknown]]),
    ...(record(node.additionalProperties)
      ? [['additionalProperties', node.additionalProperties] as [string, unknown]]
      : []),
    ...((node.anyOf || []) as unknown[]).map((v, i) => [`anyOf/${i}`, v] as [string, unknown]),
  ];
}
export function assertSupportedSchema(value: unknown, name: string, maxBytes = 65536): asserts value is Schema {
  const fail = (path: string, why: string): never => {
    throw new PramaanSchemaError(name, path, why);
  };
  if (!record(value) || !json(value)) {
    fail('/', 'must be a JSON object without cycles or non-finite values');
  }
  const root = value as Schema;
  if (Buffer.byteLength(JSON.stringify(root)) > maxBytes) {
    fail('/', `exceeds ${maxBytes} bytes`);
  }
  if (root.type !== 'object') {
    fail('/type', 'root must have type object');
  }
  let count = 0;
  const nodes = new Set<Schema>();
  function walk(node: unknown, path: string, depth: number): void {
    if (!record(node)) {
      fail(path, 'schema node must be an object');
    }
    const n = node as Schema;
    if (depth > 16) {
      fail(path, 'exceeds depth 16');
    }
    if (++count > 256) {
      fail(path, 'exceeds 256 nodes');
    }
    nodes.add(n);
    for (const [k, v] of Object.entries(n)) {
      const p = `${path}/${segment(k)}`;
      if (!keys.has(k)) {
        fail(p, `unsupported keyword ${k}`);
      }
      if (k === 'type') {
        const list = Array.isArray(v) ? v : [v];
        if (
          !list.length ||
          new Set(list).size !== list.length ||
          list.some((t) => typeof t !== 'string' || !types.has(t))
        ) {
          fail(p, 'invalid type');
        }
      }
      if ((k === 'properties' || k === '$defs') && !record(v)) {
        fail(p, 'must be an object of schemas');
      }
      if (
        k === 'required' &&
        (!Array.isArray(v) || v.some((t) => typeof t !== 'string') || new Set(v).size !== v.length)
      ) {
        fail(p, 'must be unique property names');
      }
      if (k === 'additionalProperties' && typeof v !== 'boolean' && !record(v)) {
        fail(p, 'must be a boolean or schema');
      }
      if (k === 'items' && !record(v)) {
        fail(p, 'must be one schema');
      }
      if (k === 'anyOf' && (!Array.isArray(v) || !v.length || v.length > 16)) {
        fail(p, 'requires 1 to 16 branches');
      }
      if (k === 'enum' && (!Array.isArray(v) || !v.length || v.length > 256)) {
        fail(p, 'requires 1 to 256 values');
      }
      if (['title', 'description', '$ref'].includes(k) && typeof v !== 'string') {
        fail(p, 'must be a string');
      }
      if (k === 'examples' && !Array.isArray(v)) {
        fail(p, 'must be an array');
      }
      if (
        bounds.has(k) &&
        (typeof v !== 'number' ||
          !Number.isFinite(v) ||
          ((k.includes('Length') || k.includes('Items')) && (!Number.isInteger(v) || v < 0)))
      ) {
        fail(p, 'invalid bound');
      }
    }
    for (const [k, v] of children(n)) {
      walk(v, `${path}/${k}`, depth + 1);
    }
  }
  walk(root, '', 0);
  let expanded = 0;
  function refs(node: Schema, path: string, stack: Set<Schema>, depth: number): void {
    if (stack.has(node) || depth > 32 || ++expanded > 4096) {
      fail(path, 'recursive or overly expanded reference');
    }
    const next = new Set(stack).add(node);
    if (node.$ref !== undefined) {
      const ref = node.$ref as string;
      if (!ref.startsWith('#/') || /~(?![01])/.test(ref)) {
        fail(`${path}/$ref`, 'only local #/... references are allowed');
      }
      let target: unknown = root;
      for (const key of ref
        .slice(2)
        .split('/')
        .map((k) => k.replaceAll('~1', '/').replaceAll('~0', '~'))) {
        if (!record(target) || !Object.hasOwn(target, key)) {
          fail(`${path}/$ref`, 'unresolved reference');
        }
        target = (target as Schema)[key];
      }
      if (!record(target) || !nodes.has(target)) {
        fail(`${path}/$ref`, 'reference must target a schema node');
      }
      refs(target as Schema, `${path}/$ref`, next, depth + 1);
    }
    for (const [k, v] of children(node)) {
      refs(v as Schema, `${path}/${k}`, next, depth + 1);
    }
  }
  refs(root, '', new Set(), 0);
}
export function normalizeSchema(value: unknown, name: string, maxBytes = 65536): Schema {
  if (!record(value) || !json(value)) {
    throw new PramaanSchemaError(name, '/', 'must be a JSON object');
  }
  const copy = structuredClone(value);
  function clean(node: Schema) {
    delete node.$schema;
    delete node.format;
    // Only visit schema nodes: property names and annotation data are not keywords.
    if (record(node.properties)) {
      for (const v of Object.values(node.properties)) {
        if (record(v)) {
          clean(v);
        }
      }
    }
    if (record(node.$defs)) {
      for (const v of Object.values(node.$defs)) {
        if (record(v)) {
          clean(v);
        }
      }
    }
    if (record(node.items)) {
      clean(node.items);
    }
    if (record(node.additionalProperties)) {
      clean(node.additionalProperties);
    }
    if (Array.isArray(node.anyOf)) {
      for (const v of node.anyOf) {
        if (record(v)) {
          clean(v);
        }
      }
    }
  }
  clean(copy);
  assertSupportedSchema(copy, name, maxBytes);
  return copy;
}
export function preparePramaanSchemas(id: string, input: unknown, normalize = true): unknown {
  if (!record(input)) {
    return input;
  }
  const out = { ...input };
  if (id === 'llm.chat' || id === 'llm.complete') {
    if (!Array.isArray(out.messages) || !out.messages.length || out.prompt !== undefined) {
      throw new PramaanSchemaError(id, '/messages', 'send messages, not prompt');
    }
    if (
      out.maxTokens !== undefined &&
      (typeof out.maxTokens !== 'number' || !Number.isInteger(out.maxTokens) || out.maxTokens < 64)
    ) {
      throw new PramaanSchemaError(id, '/maxTokens', 'must be at least 64');
    }
  }
  if ((id === 'llm.chat' || id === 'llm.complete') && out.maxTokens === undefined) {
    out.maxTokens = 256;
  }
  const schemas: Schema[] = [];
  const check = (schema: unknown, name: string, limit = 65536) => {
    const ready = normalize ? normalizeSchema(schema, name, limit) : schema;
    assertSupportedSchema(ready, name, limit);
    schemas.push(ready);
    return ready;
  };
  if (id === 'document.extract' && out.schema !== undefined) {
    out.schema = check(
      out.schema,
      record(out.schema) && typeof out.schema.title === 'string' ? out.schema.title : 'document.extract.schema',
      8000,
    );
  }
  if ((id === 'llm.chat' || id === 'llm.complete' || id.startsWith('outcome:')) && out.jsonSchema !== undefined) {
    out.jsonSchema = check(out.jsonSchema, `${id}.jsonSchema`);
  }
  if ((id === 'llm.chat' || id.startsWith('outcome:')) && Array.isArray(out.tools)) {
    out.tools = out.tools.map((t, i) =>
      record(t) && t.parameters !== undefined
        ? { ...t, parameters: check(t.parameters, `${id}.tool.${typeof t.name === 'string' ? t.name : i}.parameters`) }
        : t,
    );
  }
  if (id.startsWith('outcome:') && out.schema !== undefined) {
    out.schema = check(out.schema, `${id}.schema`);
  }
  if (id === 'llm.chat' && Buffer.byteLength(JSON.stringify(schemas)) > 65536) {
    throw new PramaanSchemaError(id, '/tools', 'combined schemas exceed 65536 bytes');
  }
  return out;
}
