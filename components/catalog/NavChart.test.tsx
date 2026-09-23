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

  it("rejects a literal points array (points must always be path-bound)", () => {
    const result = NavChartPropsSchema.safeParse({
      title: "3-Year NAV Trend",
      points: [{ date: "2026-01-01", nav: 100 }],
    });
    expect(result.success).toBe(false);
  });
});
