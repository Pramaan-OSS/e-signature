import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setPramaanClientForTests } from '../pramaan';
import { clearCatalogueCacheForTests, searchCatalogue } from './catalogue-search';

const session = { key: 'user_1:team_2:session_test', expiresAt: Date.now() + 60 * 60_000 };
const call = vi.fn();
beforeEach(() => {
  clearCatalogueCacheForTests();
  call.mockReset();
  setPramaanClientForTests({ call } as never);
});
afterEach(() => {
  setPramaanClientForTests(undefined);
  clearCatalogueCacheForTests();
});
it('loads two pages only when requested and leaves no cursor on the last page', async () => {
  call
    .mockResolvedValueOnce({ results: [{ app: 'workspace', action: 'WORKSPACE_FIRST' }], nextCursor: 'opaque_next' })
    .mockResolvedValueOnce({ results: [{ app: 'workspace', action: 'WORKSPACE_SECOND' }] });
  const first = await searchCatalogue('find file', 'workspace', undefined, session);
  expect(call).toHaveBeenCalledTimes(1);
  expect(first.nextCursor).toBe('opaque_next');
  const last = await searchCatalogue('find file', 'workspace', first.nextCursor, session);
  expect(last.results[0].action).toBe('WORKSPACE_SECOND');
  expect(last).not.toHaveProperty('nextCursor');
  expect(call.mock.calls[1][1]).toEqual({ query: 'find file', app: 'workspace', limit: 50, cursor: 'opaque_next' });
});
it('reuses paid pages and pending calls within the same session', async () => {
  call.mockResolvedValue({ results: [], nextCursor: 'opaque_next' });
  const [first, second] = await Promise.all([
    searchCatalogue('find', 'workspace', undefined, session),
    searchCatalogue('find', 'workspace', undefined, session),
  ]);
  expect(first).toEqual(second);
  expect(call).toHaveBeenCalledTimes(1);
  await searchCatalogue('find', 'workspace', 'opaque_next', session);
  await searchCatalogue('find', 'workspace', 'opaque_next', session);
  expect(call).toHaveBeenCalledTimes(2);
});
it('never shares page data across sessions or changed searches', async () => {
  call.mockResolvedValue({ results: [] });
  await searchCatalogue('find', 'workspace', undefined, session);
  await searchCatalogue('find', 'workspace', undefined, { ...session, key: 'another_session' });
  await searchCatalogue('other', 'workspace', undefined, session);
  expect(call).toHaveBeenCalledTimes(3);
});
it('does not cache a failed lookup or an expired session', async () => {
  call.mockRejectedValueOnce({ code: 'upstream_unavailable' }).mockResolvedValue({ results: [] });
  await expect(searchCatalogue('find', 'workspace', undefined, session)).rejects.toThrow();
  await searchCatalogue('find', 'workspace', undefined, session);
  expect(call).toHaveBeenCalledTimes(2);
  const expired = { ...session, key: 'expired', expiresAt: Date.now() - 1 };
  await searchCatalogue('find', 'workspace', undefined, expired);
  await searchCatalogue('find', 'workspace', undefined, expired);
  expect(call).toHaveBeenCalledTimes(4);
});
