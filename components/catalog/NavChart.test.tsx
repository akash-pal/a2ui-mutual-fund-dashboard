import { describe, it, expect } from "vitest";
import { NavChartPropsSchema } from "./NavChart";

describe("NavChartPropsSchema", () => {
  it("accepts a literal title and a path-bound points array", () => {
    const result = NavChartPropsSchema.safeParse({
      title: "3-Year NAV Trend",
      points: { path: "/navPoints" },
    });
    expect(result.success).toBe(true);
  });

  it("also accepts a literal points array at the component-schema level", () => {
    // The A2UI generic binder only resolves a {path} reference when the field's
    // schema is a union (DynamicValue) -- a bare DataBinding object is treated as
    // a static nested object and never resolved. So this schema (used by the real
    // Catalog/binder) must accept a literal here; the "always path-bound, never a
    // literal" rule for LLM-generated structures is enforced separately, on
    // AnyCatalogComponentSchema in lib/catalog-messages.ts.
    const result = NavChartPropsSchema.safeParse({
      title: "3-Year NAV Trend",
      points: [{ date: "2026-01-01", nav: 100 }],
    });
    expect(result.success).toBe(true);
  });
});
