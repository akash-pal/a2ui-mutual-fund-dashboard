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

  it("rejects a literal items array", () => {
    const result = RankedListPropsSchema.safeParse({
      title: "Top Large Cap Funds",
      items: [{ name: "Fund A", value: "12%" }],
    });
    expect(result.success).toBe(false);
  });
});
