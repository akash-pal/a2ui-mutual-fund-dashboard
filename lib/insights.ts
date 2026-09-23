import type { TrailingReturns } from "./metrics";

function fmtPct(value: number | null): string | null {
  if (value === null) return null;
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function generateSingleFundInsight(fundName: string, returns: TrailingReturns): string {
  const oneYear = fmtPct(returns["1Y"]);
  if (oneYear) {
    return `${fundName} has returned ${oneYear} over the trailing 1 year, based on NAV history from mfapi.in.`;
  }
  const oneMonth = fmtPct(returns["1M"]);
  if (oneMonth) {
    return `${fundName} doesn't have a full year of NAV history yet; over the trailing 1 month it has returned ${oneMonth}.`;
  }
  return `${fundName} doesn't have enough NAV history yet to compute trailing returns.`;
}

export function generateComparisonInsight(
  rows: Array<{ name: string; oneYearReturn: number | null }>
): string {
  const ranked = rows
    .filter((r) => r.oneYearReturn !== null)
    .sort((a, b) => (b.oneYearReturn as number) - (a.oneYearReturn as number));
  if (ranked.length === 0) {
    return "None of the selected funds have enough NAV history yet for a 1-year comparison.";
  }
  const best = ranked[0];
  return `${best.name} led this group over the trailing 1 year, at ${fmtPct(best.oneYearReturn)}.`;
}

export function generateRankingInsight(
  category: string,
  items: Array<{ name: string; oneYearReturn: number | null }>
): string {
  const top = items.find((i) => i.oneYearReturn !== null);
  if (!top) {
    return `No funds in the ${category} category have enough NAV history yet for a 1-year ranking.`;
  }
  return `Among ${category} funds, ${top.name} leads the trailing 1-year ranking at ${fmtPct(top.oneYearReturn)}.`;
}
