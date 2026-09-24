import type { SchemeListEntry } from "./mfapi";

export type IntentType = "single_fund" | "compare_funds" | "category_ranking";

export interface ResolvedIntent {
  type: IntentType;
  schemeCodes: number[];
  category?: string;
}

const CATEGORY_KEYWORDS = ["large cap", "mid cap", "small cap", "flexi cap", "multi cap", "elss"];

/** Strips the plan (Direct/Regular) and option (Growth/IDCW/Dividend) suffixes that
 * every real mfapi.in scheme name carries, so "Fund X - Direct Plan - Growth Option"
 * and "Fund X - Regular Plan - IDCW Option" both reduce to the same base "fund x". */
function cleanSchemeName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      / - direct plan| - regular plan| - growth option| - idcw option| - dividend option| - growth| - idcw| - dividend/g,
      ""
    )
    .trim();
}

// Matched against the same " - <suffix>" delimited form cleanSchemeName strips --
// a bare `.includes("growth")` would false-positive on funds whose own name
// contains that word (e.g. the real "Nippon India Growth Mid Cap Fund").
const DIRECT_SUFFIX = / - direct plan/i;
const GROWTH_SUFFIX = / - growth option| - growth\b/i;

function isDirectVariant(schemeName: string): boolean {
  return DIRECT_SUFFIX.test(schemeName);
}

/** Growth reinvests returns into NAV and is what "how has this fund done" means by
 * convention; IDCW/Dividend variants pay out and have a lower, less representative NAV. */
function isGrowthVariant(schemeName: string): boolean {
  return GROWTH_SUFFIX.test(schemeName);
}

/** True if `candidate` should replace `current` as the preferred variant for the
 * same cleaned base name: Direct over Regular, then Growth over IDCW/Dividend. */
function isPreferredVariant(candidate: SchemeListEntry, current: SchemeListEntry): boolean {
  const candidateIsDirect = isDirectVariant(candidate.schemeName);
  const currentIsDirect = isDirectVariant(current.schemeName);
  if (candidateIsDirect !== currentIsDirect) return candidateIsDirect;
  const candidateIsGrowth = isGrowthVariant(candidate.schemeName);
  const currentIsGrowth = isGrowthVariant(current.schemeName);
  return candidateIsGrowth && !currentIsGrowth;
}

/** Deduplicates schemes that share a cleaned base name (the same fund listed under
 * multiple Direct/Regular x Growth/IDCW/Dividend variants), keeping one preferred
 * entry per fund. */
function dedupeByCleanedName(schemes: SchemeListEntry[]): SchemeListEntry[] {
  const bestByCleanedName = new Map<string, SchemeListEntry>();
  for (const scheme of schemes) {
    const cleaned = cleanSchemeName(scheme.schemeName);
    const existing = bestByCleanedName.get(cleaned);
    if (!existing || isPreferredVariant(scheme, existing)) {
      bestByCleanedName.set(cleaned, scheme);
    }
  }
  return Array.from(bestByCleanedName.values());
}

/** Finds the scheme whose (cleaned) name appears inside `text`, preferring the
 * longest match, then the preferred Direct/Growth variant on a length tie. */
function findSchemeCode(text: string, schemes: SchemeListEntry[]): number | null {
  const normalized = text.toLowerCase().trim();
  let best: { scheme: SchemeListEntry; length: number } | null = null;
  for (const scheme of schemes) {
    const cleaned = cleanSchemeName(scheme.schemeName);
    if (!normalized.includes(cleaned)) continue;
    const isBetter =
      !best ||
      cleaned.length > best.length ||
      (cleaned.length === best.length && isPreferredVariant(scheme, best.scheme));
    if (isBetter) {
      best = { scheme, length: cleaned.length };
    }
  }
  return best?.scheme.schemeCode ?? null;
}

/**
 * Finds every distinct scheme mentioned in `query`. Real mfapi.in data lists the
 * same fund multiple times -- Direct/Regular Plan crossed with Growth/IDCW/Dividend
 * option -- so this de-duplicates by cleaned name, preferring the Direct+Growth
 * entry when a query names a fund with no plan/option qualifier (the common phrasing).
 */
function findAllSchemesInQuery(query: string, schemes: SchemeListEntry[]): number[] {
  const lowerQuery = query.toLowerCase();
  const matching = schemes.filter((scheme) => lowerQuery.includes(cleanSchemeName(scheme.schemeName)));
  return dedupeByCleanedName(matching).map((s) => s.schemeCode);
}

/**
 * Returns the category keyword that appears earliest in the query text, not the
 * first one in CATEGORY_KEYWORDS's own order — so "multi cap and large cap" resolves
 * to "multi cap", matching how a reader would prioritize the query's own phrasing.
 */
function findCategoryInQuery(lowerQuery: string): string | undefined {
  let best: { keyword: string; index: number } | null = null;
  for (const keyword of CATEGORY_KEYWORDS) {
    const index = lowerQuery.indexOf(keyword);
    if (index !== -1 && (!best || index < best.index)) {
      best = { keyword, index };
    }
  }
  return best?.keyword;
}

export function resolveIntent(query: string, schemes: SchemeListEntry[]): ResolvedIntent {
  const lowerQuery = query.toLowerCase();

  const comparisonSplit = lowerQuery.split(/\bvs\b|\bversus\b/);
  if (comparisonSplit.length >= 2) {
    const schemeCodes = Array.from(
      new Set(
        comparisonSplit
          .map((part) => findSchemeCode(part, schemes))
          .filter((code): code is number => code !== null)
      )
    );
    if (schemeCodes.length >= 2) {
      return { type: "compare_funds", schemeCodes };
    }
  }

  const category = findCategoryInQuery(lowerQuery);
  if (category && /\bbest\b|\btop\b/.test(lowerQuery)) {
    const matching = schemes.filter((s) => s.schemeName.toLowerCase().includes(category));
    const schemeCodes = dedupeByCleanedName(matching).map((s) => s.schemeCode);
    return { type: "category_ranking", schemeCodes, category };
  }

  const schemeCodes = findAllSchemesInQuery(query, schemes);
  return { type: "single_fund", schemeCodes };
}
