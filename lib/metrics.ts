import type { NavPoint } from "./mfapi";

export type { NavPoint };

export interface TrailingReturns {
  "1M": number | null;
  "3M": number | null;
  "1Y": number | null;
  "3Y": number | null;
  "5Y": number | null;
}

function parseDate(date: string): Date {
  const [day, month, year] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Subtracts calendar months/years from `date`, clamping the day-of-month to
 * the last valid day of the target month instead of letting it roll over
 * into a later month (e.g. Mar 31 minus 1 month -> Feb 28, not Mar 3).
 */
function subtractCalendar(date: Date, { months = 0, years = 0 }: { months?: number; years?: number }): Date {
  const day = date.getDate();
  const d = new Date(date);
  d.setDate(1);
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - months);
  const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInTargetMonth));
  return d;
}

/** Returns NAV points sorted most-recent-first, regardless of input order. */
function sortDescending(nav: NavPoint[]): NavPoint[] {
  return [...nav].sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
}

/** Finds the NAV point on or before `target`, or null if history doesn't reach that far. */
function navOnOrBefore(sorted: NavPoint[], target: Date): NavPoint | null {
  for (const point of sorted) {
    if (parseDate(point.date).getTime() <= target.getTime()) {
      return point;
    }
  }
  return null;
}

function periodReturn(sorted: NavPoint[], latest: NavPoint, monthsBack: number, asOf: Date): number | null {
  const target = subtractCalendar(asOf, { months: monthsBack });
  const past = navOnOrBefore(sorted, target);
  if (!past) return null;
  return ((latest.nav - past.nav) / past.nav) * 100;
}

export function computeTrailingReturns(nav: NavPoint[], asOf: Date = new Date()): TrailingReturns {
  const sorted = sortDescending(nav);
  const latest = navOnOrBefore(sorted, asOf) ?? sorted[0];
  if (!latest) {
    return { "1M": null, "3M": null, "1Y": null, "3Y": null, "5Y": null };
  }
  return {
    "1M": periodReturn(sorted, latest, 1, asOf),
    "3M": periodReturn(sorted, latest, 3, asOf),
    "1Y": periodReturn(sorted, latest, 12, asOf),
    "3Y": periodReturn(sorted, latest, 36, asOf),
    "5Y": periodReturn(sorted, latest, 60, asOf),
  };
}

export function computeCAGR(nav: NavPoint[], years: number, asOf: Date = new Date()): number | null {
  const sorted = sortDescending(nav);
  const latest = navOnOrBefore(sorted, asOf) ?? sorted[0];
  if (!latest) return null;
  const target = subtractCalendar(asOf, { years });
  const past = navOnOrBefore(sorted, target);
  if (!past || past.nav <= 0) return null;
  return (Math.pow(latest.nav / past.nav, 1 / years) - 1) * 100;
}

export function computeVolatility(nav: NavPoint[]): number | null {
  const sorted = sortDescending(nav).slice().reverse(); // chronological order
  if (sorted.length < 2) return null;
  const dailyReturns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].nav;
    const curr = sorted[i].nav;
    if (prev > 0) dailyReturns.push((curr - prev) / prev);
  }
  if (dailyReturns.length === 0) return 0;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / dailyReturns.length;
  const dailyStdDev = Math.sqrt(variance);
  // Annualized volatility, as a percentage.
  return dailyStdDev * Math.sqrt(252) * 100;
}

export function computeMaxDrawdown(nav: NavPoint[]): number | null {
  const chronological = sortDescending(nav).slice().reverse();
  if (chronological.length === 0) return null;
  let peak = chronological[0].nav;
  let maxDrawdown = 0;
  for (const point of chronological) {
    if (point.nav > peak) peak = point.nav;
    const drawdown = ((point.nav - peak) / peak) * 100;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}
