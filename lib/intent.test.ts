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

  it("prefers Growth over IDCW even when the fund's own name contains the word 'Growth'", () => {
    // Real fund: a bare `.includes("growth")` check would false-positive on the base
    // name itself ("Nippon India Growth Mid Cap Fund"), making Growth-vs-IDCW selection
    // depend on array order instead of correctly reading the trailing option suffix.
    const realisticSchemes: SchemeListEntry[] = [
      { schemeCode: 100375, schemeName: "Nippon India Growth Mid Cap Fund - Regular Plan - IDCW Option" },
      { schemeCode: 100377, schemeName: "Nippon India Growth Mid Cap Fund - Regular Plan - Growth Option" },
      { schemeCode: 118666, schemeName: "Nippon India Growth Mid Cap Fund - Direct Plan - IDCW Option" },
      { schemeCode: 118668, schemeName: "Nippon India Growth Mid Cap Fund - Direct Plan - Growth Option" },
    ];
    const result = resolveIntent("How has Nippon India Growth Mid Cap Fund done?", realisticSchemes);
    expect(result.type).toBe("single_fund");
    expect(result.schemeCodes).toEqual([118668]);
  });

  it("does not resolve a real fund's query to mfapi.in's degenerate bare-named 'Growth'/'Dividend' schemes", () => {
    // Real mfapi.in data includes schemes literally named "Growth" (code 104031) and
    // "Dividend" (104030), with no fund name at all -- after cleaning, both are
    // substrings of the real "Nippon India Growth Mid Cap Fund"'s own name. Listing
    // the degenerate schemes FIRST would have made the old "collect every substring
    // match, take the first by insertion order" logic pick 104031 over the real,
    // much longer match.
    const realisticSchemes: SchemeListEntry[] = [
      { schemeCode: 104031, schemeName: "Growth" },
      { schemeCode: 104030, schemeName: "Dividend" },
      { schemeCode: 100375, schemeName: "Nippon India Growth Mid Cap Fund - Regular Plan - IDCW Option" },
      { schemeCode: 100377, schemeName: "Nippon India Growth Mid Cap Fund - Regular Plan - Growth Option" },
      { schemeCode: 118666, schemeName: "Nippon India Growth Mid Cap Fund - Direct Plan - IDCW Option" },
      { schemeCode: 118668, schemeName: "Nippon India Growth Mid Cap Fund - Direct Plan - Growth Option" },
    ];
    const result = resolveIntent("How has Nippon India Growth Mid Cap Fund done?", realisticSchemes);
    expect(result.type).toBe("single_fund");
    expect(result.schemeCodes).toEqual([118668]);
  });

  it("returns no match for a query that only mentions a degenerate bare-named scheme's word", () => {
    const realisticSchemes: SchemeListEntry[] = [
      { schemeCode: 104031, schemeName: "Growth" },
      { schemeCode: 104030, schemeName: "Dividend" },
    ];
    const result = resolveIntent("Tell me about growth funds", realisticSchemes);
    expect(result.type).toBe("single_fund");
    expect(result.schemeCodes).toEqual([]);
  });

  it("de-duplicates Direct/Growth variants even when mfapi.in omits spaces around the hyphen", () => {
    // Real mfapi.in data is inconsistent about spacing: "UTI Large Cap Fund-Growth
    // Option" (no spaces) is just as common as "Fund - Growth Option" (spaces). Without
    // handling both forms, these would clean to different names and dedupe as two
    // separate "funds" instead of one.
    const realisticSchemes: SchemeListEntry[] = [
      { schemeCode: 30, schemeName: "UTI Large Cap Fund-Regular Plan-Growth Option" },
      { schemeCode: 31, schemeName: "UTI Large Cap Fund-Direct Plan-Growth Option" },
    ];
    const result = resolveIntent("Show me the best large cap funds", realisticSchemes);
    expect(result.type).toBe("category_ranking");
    expect(result.schemeCodes).toEqual([31]);
  });

  it("caps the number of category_ranking candidates instead of resolving every matching scheme", () => {
    // A real category like "large cap" matches 400+ schemes before de-duplication --
    // fetching NAV history for all of them would mean hundreds of parallel HTTP calls.
    const manySchemes: SchemeListEntry[] = Array.from({ length: 200 }, (_, i) => ({
      schemeCode: 1000 + i,
      schemeName: `Sample Large Cap Fund ${i} - Direct Plan - Growth Option`,
    }));
    const result = resolveIntent("Show me the best large cap funds", manySchemes);
    expect(result.type).toBe("category_ranking");
    expect(result.schemeCodes.length).toBeLessThanOrEqual(30);
  });
});
