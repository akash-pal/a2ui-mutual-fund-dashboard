import { describe, it, expect } from "vitest";
import { ComparisonTablePropsSchema } from "./ComparisonTable";

describe("ComparisonTablePropsSchema", () => {
  it("accepts literal column headers and a path-bound rows array", () => {
    const result = ComparisonTablePropsSchema.safeParse({
      title: "Fund Comparison",
      columns: ["Fund", "1Y Return", "3Y Return"],
      rows: { path: "/rows" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects literal rows (rows must always be path-bound)", () => {
    const result = ComparisonTablePropsSchema.safeParse({
      title: "Fund Comparison",
      columns: ["Fund", "1Y Return"],
      rows: [["Fund A", "12%"]],
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one column", () => {
    const result = ComparisonTablePropsSchema.safeParse({
      title: "Fund Comparison",
      columns: [],
      rows: { path: "/rows" },
    });
    expect(result.success).toBe(false);
  });
});
