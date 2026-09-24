import { describe, it, expect } from "vitest";
import { InsightCalloutPropsSchema } from "./InsightCallout";

describe("InsightCalloutPropsSchema", () => {
  it("accepts a path-bound text field", () => {
    const result = InsightCalloutPropsSchema.safeParse({ text: { path: "/insightText" } });
    expect(result.success).toBe(true);
  });

  it("also accepts literal text at the component-schema level", () => {
    // See the comment in NavChart.test.tsx: DynamicString is a union type (unlike
    // a bare DataBinding), and it's what lets the generic binder resolve the
    // {path} reference at all. The "always path-bound, never LLM-authored" rule
    // for LLM-generated structures is enforced on AnyCatalogComponentSchema in
    // lib/catalog-messages.ts.
    const result = InsightCalloutPropsSchema.safeParse({ text: "This fund did well." });
    expect(result.success).toBe(true);
  });
});
