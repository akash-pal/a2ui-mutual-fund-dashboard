import { describe, it, expect } from "vitest";
import { InsightCalloutPropsSchema } from "./InsightCallout";

describe("InsightCalloutPropsSchema", () => {
  it("accepts a path-bound text field", () => {
    const result = InsightCalloutPropsSchema.safeParse({ text: { path: "/insightText" } });
    expect(result.success).toBe(true);
  });

  it("rejects literal text (insight copy is always path-bound and computed fresh)", () => {
    const result = InsightCalloutPropsSchema.safeParse({ text: "This fund did well." });
    expect(result.success).toBe(false);
  });
});
