import { expect, it } from 'vitest';
import { catalogueActions, requireCatalogueAction } from './catalogue';

const action = {
  app: 'workspace',
  action: 'WORKSPACE_SAVE_DOCUMENT',
  inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
};
const result = { discovery: 'catalogue-search', results: [action] };
it('selects catalogue-returned schemas and exact keys without an allowlist', () => {
  expect(requireCatalogueAction(result, action.action)).toEqual(action);
});
it('rejects legacy automation-list results even when they contain the same key', () => {
  expect(catalogueActions({ results: [action] })).toEqual([]);
  expect(() => requireCatalogueAction({ results: [action] }, action.action)).toThrow('saved catalogue');
});
it('rejects unknown or ambiguous keys', () => {
  expect(() => requireCatalogueAction(result, 'WORKSPACE_OTHER')).toThrow('saved catalogue');
  expect(() => requireCatalogueAction({ ...result, results: [action, action] }, action.action)).toThrow(
    'saved catalogue',
  );
});
it('blocks omitted schemas rather than inventing action fields', () => {
  expect(() =>
    requireCatalogueAction({ ...result, results: [{ ...action, inputSchema: undefined }] }, action.action),
  ).toThrow('no input schema');
});
it('preserves underscored slugs and discards malformed catalogue rows', () => {
  expect(
    catalogueActions({
      ...result,
      results: [
        { ...action, app: 'google_search_console' },
        { app: 'workspace', action: 'bad key' },
      ],
    }),
  ).toEqual([{ ...action, app: 'google_search_console' }]);
});

it('reads list results and a safe display link from execution output', async () => {
  const { appExecutionOutput } = await import('./catalogue');
  expect(
    appExecutionOutput({
      output: { results: [{ title: 'Agreement' }], display_url: 'https://example.test/agreement' },
    }),
  ).toEqual({ results: [{ title: 'Agreement' }], displayUrl: 'https://example.test/agreement' });
});
it('handles absent, malformed and alternate list output without guessing', async () => {
  const { appExecutionOutput } = await import('./catalogue');
  for (const value of [null, 'text', { output: [] }, { output: { results: 'not an array' } }]) {
    expect(appExecutionOutput(value)).toEqual({ results: [] });
  }
  expect(appExecutionOutput({ results: [1] })).toEqual({ results: [1] });
});
it('omits invalid or unsafe display links', async () => {
  const { appExecutionOutput } = await import('./catalogue');
  for (const display_url of [
    'javascript:alert(1)',
    'http://example.test',
    'https://secret@example.test',
    'not a link',
    12,
  ]) {
    expect(appExecutionOutput({ output: { display_url } }).displayUrl).toBeUndefined();
  }
});
