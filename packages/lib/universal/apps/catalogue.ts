export type CataloguedAction = { app: string; action: string; description?: string; inputSchema?: unknown };
export function catalogueActions(result: unknown): CataloguedAction[] {
  if (
    !result ||
    typeof result !== 'object' ||
    !('discovery' in result) ||
    result.discovery !== 'catalogue-search' ||
    !('results' in result) ||
    !Array.isArray(result.results)
  ) {
    return [];
  }
  return result.results.filter(
    (item): item is CataloguedAction =>
      item &&
      typeof item === 'object' &&
      typeof item.app === 'string' &&
      /^[a-z0-9_-]{1,64}$/.test(item.app) &&
      typeof item.action === 'string' &&
      /^[A-Z][A-Z0-9_]{1,127}$/.test(item.action),
  );
}
export function requireCatalogueAction(result: unknown, key: string): CataloguedAction {
  const matches = catalogueActions(result).filter((item) => item.action === key);
  if (matches.length !== 1) {
    throw new Error('Choose an action from this workspace’s saved catalogue search.');
  }
  const action = matches[0];
  if (!action.inputSchema || typeof action.inputSchema !== 'object' || Array.isArray(action.inputSchema)) {
    throw new Error('This action has no input schema. Choose another action.');
  }
  return action;
}

/** Execute responses may contain a list, a link, neither, or a non-object output. */
export function appExecutionOutput(result: unknown): { results: unknown[]; displayUrl?: string } {
  const record = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const root = record(result);
  const output = record(root?.output);
  const results = Array.isArray(output?.results) ? output.results : Array.isArray(root?.results) ? root.results : [];
  const raw = output?.display_url ?? root?.display_url;
  if (typeof raw === 'string') {
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' && !url.username && !url.password) {
        return { results, displayUrl: url.href };
      }
    } catch {
      /* Invalid links are omitted. */
    }
  }
  return { results };
}
