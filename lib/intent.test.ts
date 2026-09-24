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

  it("de-duplicates a fund's Direct and Regular plan entries into a single match", () => {
    const pairedSchemes: SchemeListEntry[] = [
      { schemeCode: 10, schemeName: "Sample Bluechip Fund - Regular Plan" },
      { schemeCode: 11, schemeName: "Sample Bluechip Fund - Direct Plan" },
    ];
    const result = resolveIntent("How has the Sample Bluechip Fund performed?", pairedSchemes);
    expect(result.type).toBe("single_fund");
    expect(result.schemeCodes).toEqual([11]); // prefers the Direct Plan entry
  });

  it("does not report a self-vs-self comparison as compare_funds with duplicate codes", () => {
    const result = resolveIntent("Example Flexi Cap Fund vs Example Flexi Cap Fund", schemes);
    expect(result.type).not.toBe("compare_funds");
    expect(new Set(result.schemeCodes).size).toBe(result.schemeCodes.length);
  });

  it("resolves category ranking to the category mentioned first in the query, not array order", () => {
    const result = resolveIntent("Show me the best multi cap and large cap funds", schemes);
    expect(result.category).toBe("multi cap");
  });

  it("prefers the Direct Plan entry when comparing a fund that has both Direct and Regular listings", () => {
    const pairedSchemes: SchemeListEntry[] = [
      { schemeCode: 20, schemeName: "Sample Bluechip Fund - Regular Plan" },
      { schemeCode: 21, schemeName: "Sample Bluechip Fund - Direct Plan" },
      { schemeCode: 22, schemeName: "Sample Largecap Fund - Direct Plan" },
    ];
    const result = resolveIntent("Sample Bluechip Fund vs Sample Largecap Fund", pairedSchemes);
    expect(result.type).toBe("compare_funds");
    expect(result.schemeCodes.sort()).toEqual([21, 22]);
  });

  it("matches a fund whose real-world listing always carries a Growth/IDCW option suffix", () => {
    // Every real mfapi.in scheme name ends in "- Growth Option"/"- IDCW Option" (or
    // similar) on top of the Direct/Regular Plan qualifier -- a plain query naming
    // just the fund must still match, and should prefer the Direct + Growth variant.
    const realisticSchemes: SchemeListEntry[] = [
      { schemeCode: 101762, schemeName: "HDFC Flexi Cap Fund - Regular Plan - Growth Option" },
      { schemeCode: 101763, schemeName: "HDFC Flexi Cap Fund - Regular Plan - IDCW Option" },
      { schemeCode: 118954, schemeName: "HDFC Flexi Cap Fund - Direct Plan - IDCW Option" },
      { schemeCode: 118955, schemeName: "HDFC Flexi Cap Fund - Direct Plan - Growth Option" },
    ];
    const result = resolveIntent("How has HDFC Flexi Cap Fund done?", realisticSchemes);
    expect(result.type).toBe("single_fund");
    expect(result.schemeCodes).toEqual([118955]);
  });

  it("de-duplicates Direct/Regular x Growth/IDCW variants in a category ranking, one entry per fund", () => {
    const realisticSchemes: SchemeListEntry[] = [
      { schemeCode: 101762, schemeName: "HDFC Flexi Cap Fund - Regular Plan - Growth Option" },
      { schemeCode: 101763, schemeName: "HDFC Flexi Cap Fund - Regular Plan - IDCW Option" },
      { schemeCode: 118954, schemeName: "HDFC Flexi Cap Fund - Direct Plan - IDCW Option" },
      { schemeCode: 118955, schemeName: "HDFC Flexi Cap Fund - Direct Plan - Growth Option" },
    ];
    const result = resolveIntent("Show me the best flexi cap funds", realisticSchemes);
    expect(result.type).toBe("category_ranking");
    expect(result.schemeCodes).toEqual([118955]);
  });
});
