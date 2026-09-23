import { describe, it, expect, beforeEach } from "vitest";
import { buildCacheKey, getCachedSchema, setCachedSchema, clearSchemaCache, CATALOG_VERSION } from "./cache";

beforeEach(() => {
  clearSchemaCache();
});

describe("buildCacheKey", () => {
  it("includes the intent type and catalog version", () => {
    const key = buildCacheKey("single_fund");
    expect(key).toBe(`single_fund:${CATALOG_VERSION}`);
  });

  it("produces different keys for different intent types", () => {
    expect(buildCacheKey("single_fund")).not.toBe(buildCacheKey("compare_funds"));
  });
});

describe("getCachedSchema / setCachedSchema", () => {
  it("returns undefined for a key that was never set", () => {
    expect(getCachedSchema(buildCacheKey("single_fund"))).toBeUndefined();
  });

  it("returns what was stored for a given key", () => {
    const key = buildCacheKey("single_fund");
    const value = { hello: "world" };
    setCachedSchema(key, value);
    expect(getCachedSchema(key)).toEqual(value);
  });

  it("does not leak values across different keys", () => {
    setCachedSchema(buildCacheKey("single_fund"), { a: 1 });
    expect(getCachedSchema(buildCacheKey("compare_funds"))).toBeUndefined();
  });
});

describe("clearSchemaCache", () => {
  it("removes all cached entries", () => {
    setCachedSchema(buildCacheKey("single_fund"), { a: 1 });
    clearSchemaCache();
    expect(getCachedSchema(buildCacheKey("single_fund"))).toBeUndefined();
  });
});
