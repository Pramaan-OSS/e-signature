import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

test('application migrations respect the configured database schema', () => {
  const root = new URL('../packages/prisma/migrations/', import.meta.url);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sql = readFileSync(new URL(entry.name + '/migration.sql', root), 'utf8');
    assert.doesNotMatch(
      sql,
      /\bpublic\s*\.|"public"\s*\./i,
      entry.name + ' must use the configured schema, including its seed rows and enum casts.',
    );
  }
});
