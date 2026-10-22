import { configuredDatabaseSchema, qualifiedDatabaseIdentifier } from '@e-sign/prisma/schema-name';
import { expect, it } from 'vitest';

it('defaults unqualified installations to the standard schema', () => {
  expect(qualifiedDatabaseIdentifier('postgresql://owner:secret@database.test/app', 'Envelope')).toBe(
    '"public"."Envelope"',
  );
  expect(configuredDatabaseSchema()).toBe('public');
});
it('keeps raw tables and enum types in the configured schema with pooled URLs', () => {
  const url = 'postgresql://owner:secret@database.test/app?pgbouncer=true&schema=isolated_walk';
  expect(qualifiedDatabaseIdentifier(url, 'Envelope')).toBe('"isolated_walk"."Envelope"');
  expect(qualifiedDatabaseIdentifier(url, 'EnvelopeType')).toBe('"isolated_walk"."EnvelopeType"');
});
it('quotes schema and object names instead of treating them as SQL', () => {
  const url = 'postgresql://owner:secret@database.test/app?schema=' + encodeURIComponent('odd"; SELECT 1; --');
  expect(qualifiedDatabaseIdentifier(url, 'an"object')).toBe('"odd""; SELECT 1; --"."an""object"');
});
