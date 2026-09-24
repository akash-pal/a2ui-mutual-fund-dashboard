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

  it("also accepts literal rows at the component-schema level", () => {
    // See the comment in NavChart.test.tsx: a bare DataBinding is never resolved
    // by the generic binder, so this schema (used by the real Catalog/binder)
    // must accept a literal. The "always path-bound" rule for LLM-generated
    // structures is enforced on AnyCatalogComponentSchema in lib/catalog-messages.ts.
    const result = ComparisonTablePropsSchema.safeParse({
      title: "Fund Comparison",
      columns: ["Fund", "1Y Return"],
      rows: [["Fund A", "12%"]],
    });
    expect(result.success).toBe(true);
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
