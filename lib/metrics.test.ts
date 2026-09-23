import { describe, it, expect } from "vitest";
import {
  computeTrailingReturns,
  computeCAGR,
  computeVolatility,
  computeMaxDrawdown,
  type NavPoint,
} from "./metrics";

// mfapi.in returns most-recent-first; build a two-year daily-ish series.
function buildSeries(): NavPoint[] {
  const points: NavPoint[] = [];
  const start = new Date("2026-09-23");
  let nav = 100;
  for (let i = 0; i < 730; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const date = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    points.push({ date, nav: Number(nav.toFixed(4)) });
    nav = nav / 1.0003; // walking backward, so nav decreases as i increases (i.e. it grew forward in time)
  }
  return points;
}

describe("computeTrailingReturns", () => {
  it("returns null for periods longer than the available history", () => {
    const shortSeries: NavPoint[] = [
      { date: "23-09-2026", nav: 110 },
      { date: "23-08-2026", nav: 100 },
    ];
    const result = computeTrailingReturns(shortSeries, new Date("2026-09-23"));
    expect(result["1Y"]).toBeNull();
    expect(result["3Y"]).toBeNull();
  });

  it("computes a positive 1-month return for a rising series", () => {
    const series = buildSeries();
    const result = computeTrailingReturns(series, new Date("2026-09-23"));
    expect(result["1M"]).not.toBeNull();
    expect(result["1M"]!).toBeGreaterThan(0);
  });
});

describe("computeCAGR", () => {
  it("computes ~10% CAGR for a value that grows 10% in exactly 1 year", () => {
    const series: NavPoint[] = [
      { date: "23-09-2026", nav: 110 },
      { date: "23-09-2025", nav: 100 },
    ];
    const cagr = computeCAGR(series, 1, new Date("2026-09-23"));
    expect(cagr).not.toBeNull();
    expect(cagr!).toBeCloseTo(10, 0);
  });

  it("returns null when there isn't enough history", () => {
    const series: NavPoint[] = [{ date: "23-09-2026", nav: 110 }];
    expect(computeCAGR(series, 5, new Date("2026-09-23"))).toBeNull();
  });
});

describe("computeVolatility", () => {
  it("returns 0 for a perfectly flat series", () => {
    const series: NavPoint[] = Array.from({ length: 30 }, (_, i) => ({
      date: `${String(i + 1).padStart(2, "0")}-01-2026`,
      nav: 100,
    }));
    expect(computeVolatility(series)).toBe(0);
  });

  it("returns a positive number for a fluctuating series", () => {
    const series: NavPoint[] = [
      { date: "01-01-2026", nav: 100 },
      { date: "02-01-2026", nav: 105 },
      { date: "03-01-2026", nav: 98 },
      { date: "04-01-2026", nav: 103 },
    ];
    expect(computeVolatility(series)!).toBeGreaterThan(0);
  });
});

describe("computeMaxDrawdown", () => {
  it("returns 0 for a monotonically rising series", () => {
    const series: NavPoint[] = [
      { date: "01-01-2026", nav: 100 },
      { date: "02-01-2026", nav: 105 },
      { date: "03-01-2026", nav: 110 },
    ];
    expect(computeMaxDrawdown(series)).toBe(0);
  });

  it("computes a negative drawdown for a peak-then-trough series", () => {
    const series: NavPoint[] = [
      { date: "01-01-2026", nav: 100 },
      { date: "02-01-2026", nav: 120 },
      { date: "03-01-2026", nav: 90 },
      { date: "04-01-2026", nav: 100 },
    ];
    // peak 120 -> trough 90 is a 25% drawdown
    expect(computeMaxDrawdown(series)!).toBeCloseTo(-25, 0);
  });
});
