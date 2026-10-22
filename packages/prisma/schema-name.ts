/** Match the schema used by generated queries without relying on pooled connection state. */
export function configuredDatabaseSchema(url?: string): string {
  return url ? new URL(url).searchParams.get('schema') || 'public' : 'public';
}

export function qualifiedDatabaseIdentifier(url: string | undefined, name: string): string {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return `${quote(configuredDatabaseSchema(url))}.${quote(name)}`;
}
