import { describe, it, expect } from "vitest";
import { RankedListPropsSchema } from "./RankedList";

describe("RankedListPropsSchema", () => {
  it("accepts a literal title and a path-bound items array", () => {
    const result = RankedListPropsSchema.safeParse({
      title: "Top Large Cap Funds",
      items: { path: "/items" },
    });
    expect(result.success).toBe(true);
  });

  it("also accepts a literal items array at the component-schema level", () => {
    // See the comment in NavChart.test.tsx: a bare DataBinding is never resolved
    // by the generic binder, so this schema (used by the real Catalog/binder)
    // must accept a literal. The "always path-bound" rule for LLM-generated
    // structures is enforced on AnyCatalogComponentSchema in lib/catalog-messages.ts.
    const result = RankedListPropsSchema.safeParse({
      title: "Top Large Cap Funds",
      items: [{ name: "Fund A", value: "12%" }],
    });
    expect(result.success).toBe(true);
  });
});
