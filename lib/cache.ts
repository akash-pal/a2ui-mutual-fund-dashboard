export const CATALOG_VERSION = "v1";

const schemaCache = new Map<string, unknown>();

export function buildCacheKey(intentType: string): string {
  return `${intentType}:${CATALOG_VERSION}`;
}

export function getCachedSchema<T>(key: string): T | undefined {
  return schemaCache.get(key) as T | undefined;
}

export function setCachedSchema<T>(key: string, value: T): void {
  schemaCache.set(key, value);
}

export function clearSchemaCache(): void {
  schemaCache.clear();
}
