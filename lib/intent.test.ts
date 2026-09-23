import { describe, it, expect } from "vitest";
import { resolveIntent } from "./intent";
import type { SchemeListEntry } from "./mfapi";

const schemes: SchemeListEntry[] = [
  { schemeCode: 1, schemeName: "Example Flexi Cap Fund - Direct Plan" },
  { schemeCode: 2, schemeName: "Example Large Cap Fund - Direct Plan" },
  { schemeCode: 3, schemeName: "Example Small Cap Fund - Direct Plan" },
];

describe("resolveIntent", () => {
  it("resolves a single fund lookup", () => {
    const result = resolveIntent("How has the Example Flexi Cap Fund done?", schemes);
    expect(result.type).toBe("single_fund");
    expect(result.schemeCodes).toEqual([1]);
  });

  it("resolves a comparison query with 'vs'", () => {
    const result = resolveIntent(
      "Compare Example Flexi Cap Fund vs Example Large Cap Fund",
      schemes
    );
    expect(result.type).toBe("compare_funds");
    expect(result.schemeCodes.sort()).toEqual([1, 2]);
  });

  it("resolves a comparison query with 'versus'", () => {
    const result = resolveIntent(
      "Example Large Cap Fund versus Example Small Cap Fund",
      schemes
    );
    expect(result.type).toBe("compare_funds");
    expect(result.schemeCodes.sort()).toEqual([2, 3]);
  });

  it("resolves a category ranking query", () => {
    const result = resolveIntent("Show me the best large cap funds", schemes);
    expect(result.type).toBe("category_ranking");
    expect(result.category).toBe("large cap");
    expect(result.schemeCodes).toContain(2);
  });

  it("falls back to single_fund with an empty match when nothing matches", () => {
    const result = resolveIntent("What's the weather today?", schemes);
    expect(result.type).toBe("single_fund");
    expect(result.schemeCodes).toEqual([]);
  });
});
