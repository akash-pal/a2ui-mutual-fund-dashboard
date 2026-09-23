import { describe, it, expect } from "vitest";
import { StatCardPropsSchema } from "./StatCard";

describe("StatCardPropsSchema", () => {
  it("accepts a literal label, value, and trend", () => {
    const result = StatCardPropsSchema.safeParse({
      label: "1-Year Return",
      value: "+18.4%",
      trend: "up",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a path-bound value", () => {
    const result = StatCardPropsSchema.safeParse({
      label: "1-Year Return",
      value: { path: "/statValue" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing label", () => {
    const result = StatCardPropsSchema.safeParse({ value: "+18.4%" });
    expect(result.success).toBe(false);
  });
});
