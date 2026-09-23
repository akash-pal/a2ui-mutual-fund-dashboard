import { describe, it, expect } from "vitest";
import {
  generateSingleFundInsight,
  generateComparisonInsight,
  generateRankingInsight,
} from "./insights";

describe("generateSingleFundInsight", () => {
  it("mentions the fund name and 1-year return when available", () => {
    const text = generateSingleFundInsight("Example Flexi Cap Fund", {
      "1M": 1.2,
      "3M": 3.4,
      "1Y": 18.4,
      "3Y": null,
      "5Y": null,
    });
    expect(text).toContain("Example Flexi Cap Fund");
    expect(text).toContain("18.4");
  });

  it("falls back gracefully when 1-year data is unavailable", () => {
    const text = generateSingleFundInsight("New Fund", {
      "1M": 0.5,
      "3M": null,
      "1Y": null,
      "3Y": null,
      "5Y": null,
    });
    expect(text).toContain("New Fund");
    expect(text).not.toContain("null");
  });
});

describe("generateComparisonInsight", () => {
  it("names the best performer by 1-year return", () => {
    const text = generateComparisonInsight([
      { name: "Fund A", oneYearReturn: 12 },
      { name: "Fund B", oneYearReturn: 22 },
      { name: "Fund C", oneYearReturn: 5 },
    ]);
    expect(text).toContain("Fund B");
  });
});

describe("generateRankingInsight", () => {
  it("mentions the category and the top fund", () => {
    const text = generateRankingInsight("Large Cap", [
      { name: "Top Fund", oneYearReturn: 20 },
      { name: "Second Fund", oneYearReturn: 15 },
    ]);
    expect(text).toContain("Large Cap");
    expect(text).toContain("Top Fund");
  });
});
