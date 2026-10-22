import type { Results } from '@pramaan/sdk';
import { callPramaan } from '../pramaan';
export type CatalogueSession = { key: string; expiresAt: number };
export type CataloguePage = Results['apps.catalog.search'] & {
  discovery: 'catalogue-search';
  query: string;
  app?: string;
  limit: 50;
  cursorExpiresAt: number;
};
const pages = new Map<string, { expiresAt: number; value: Promise<Results['apps.catalog.search']> }>();
export function clearCatalogueCacheForTests() {
  if (Reflect.get(process.env, 'NODE_ENV') !== 'test') {
    throw new Error('Test caches require test mode.');
  }
  pages.clear();
}
export async function searchCatalogue(
  query: string,
  app?: string,
  cursor?: string,
  session?: CatalogueSession,
): Promise<CataloguePage> {
  const input = { query: query.trim(), ...(app ? { app } : {}), limit: 50, ...(cursor ? { cursor } : {}) };
  const now = Date.now();
  for (const [key, page] of pages) {
    if (page.expiresAt <= now) {
      pages.delete(key);
    }
  }
  const key = session ? JSON.stringify([session.key, input]) : undefined;
  const existing = key ? pages.get(key) : undefined;
  const expiresAt = existing?.expiresAt ?? Math.min(session?.expiresAt ?? Infinity, now + 23 * 60 * 60_000);
  let value = existing?.value;
  if (!value) {
    value = callPramaan('apps.catalog.search', input);
    if (key && session && session.expiresAt > now) {
      if (pages.size >= 256) {
        pages.delete(pages.keys().next().value!);
      }
      pages.set(key, { expiresAt, value });
      value.catch(() => {
        if (pages.get(key)?.value === value) {
          pages.delete(key);
        }
      });
    }
  }
  const result = await value;
  return {
    results: result.results,
    ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    discovery: 'catalogue-search',
    query: input.query,
    ...(app ? { app } : {}),
    limit: 50,
    cursorExpiresAt: expiresAt,
  };
}
