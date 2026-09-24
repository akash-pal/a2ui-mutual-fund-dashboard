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

  it("returns null (not a false 0%) for periods that don't reach past a defunct fund's last NAV update", () => {
    // A fund whose data stopped updating in Dec 2022, queried as of Sep 2026 (~4
    // years stale). navOnOrBefore's "most recent point on or before target" search
    // returns this SAME last point for every lookback target that falls after Dec
    // 2022 -- without the past.date === latest.date guard, that reads as latest
    // minus itself, a real-looking but bogus 0% return, instead of "no distinct
    // historical reference in this window."
    const staleSeries: NavPoint[] = [];
    const start = new Date("2020-01-01");
    let nav = 100;
    for (let i = 0; i < 1096; i++) {
      // 2020-01-01 .. 2022-12-31
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const date = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
      staleSeries.push({ date, nav: Number(nav.toFixed(4)) });
      nav = nav * 1.0002;
    }
    const result = computeTrailingReturns(staleSeries, new Date("2026-09-23"));
    expect(result["1M"]).toBeNull();
    expect(result["3M"]).toBeNull();
    expect(result["1Y"]).toBeNull();
    expect(result["3Y"]).toBeNull();
    // 5Y reaches back to Sep 2021, which is genuinely within the fund's real
    // (2020-2022) history -- a real, non-zero return should still compute.
    expect(result["5Y"]).not.toBeNull();
    expect(result["5Y"]!).toBeGreaterThan(0);
  });

  it("correctly handles month-end dates (e.g., Mar 31 minus 1 month lands on Feb 28)", () => {
    // asOf = Mar 31, 2026. Correct target (fixed): Feb 28, 2026.
    // Buggy target (old raw setMonth): Mar 31 -> setMonth(Feb) on a 31-day value
    // overflows Feb's 28 days by 3, landing on Mar 3, 2026 — that's why this
    // fixture has a point AT Mar 1, 2026 with a distinct NAV: old code would
    // wrongly match that point instead of Feb 28.
    const series: NavPoint[] = [
      { date: "31-03-2026", nav: 105 }, // latest
      { date: "01-03-2026", nav: 102 }, // sits at the OLD buggy target — must NOT be picked
      { date: "28-02-2026", nav: 100 }, // correct 1-month-back target
    ];
    const result = computeTrailingReturns(series, new Date("2026-03-31"));
    // Fixed code finds Feb 28 (nav 100) -> (105-100)/100*100 = 5%.
    // Buggy code would find Mar 1 (nav 102) -> (105-102)/102*100 ≈ 2.94%, which
    // fails this assertion (diff > 0.5), proving the fixture is discriminating.
    expect(result["1M"]).not.toBeNull();
    expect(result["1M"]!).toBeCloseTo(5, 0);
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

  it("correctly handles leap-year dates (e.g., Feb 29 minus 1 year lands on Feb 28 of prior year)", () => {
    // asOf = Feb 29, 2028 (leap year). Correct target (fixed): Feb 28, 2027.
    // Buggy target (old raw setFullYear): Feb 29, 2028 -> setFullYear(2027) on
    // Feb 29 in a non-leap year overflows to Mar 1, 2027 — that's why this
    // fixture has a point AT Mar 1, 2027 with a distinct NAV: old code would
    // wrongly match that point instead of Feb 28, 2027.
    const series: NavPoint[] = [
      { date: "29-02-2028", nav: 110 }, // latest
      { date: "01-03-2027", nav: 103 }, // sits at the OLD buggy target — must NOT be picked
      { date: "28-02-2027", nav: 100 }, // correct 1-year-back target
    ];
    const cagr = computeCAGR(series, 1, new Date("2028-02-29"));
    // Fixed code finds Feb 28, 2027 (nav 100) -> (110/100 - 1)*100 = 10%.
    // Buggy code would find Mar 1, 2027 (nav 103) -> (110/103 - 1)*100 ≈ 6.8%,
    // which fails this assertion (diff > 0.5), proving the fixture is discriminating.
    expect(cagr).not.toBeNull();
    expect(cagr!).toBeCloseTo(10, 0);
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
