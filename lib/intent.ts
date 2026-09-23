import type { SchemeListEntry } from "./mfapi";

export type IntentType = "single_fund" | "compare_funds" | "category_ranking";

export interface ResolvedIntent {
  type: IntentType;
  schemeCodes: number[];
  category?: string;
}

const CATEGORY_KEYWORDS = ["large cap", "mid cap", "small cap", "flexi cap", "multi cap", "elss"];

function cleanSchemeName(name: string): string {
  return name.toLowerCase().replace(/ - direct plan| - regular plan/g, "").trim();
}

/** Finds the scheme whose (cleaned) name appears inside `text`, preferring the
 * longest match, then preferring the Direct Plan entry on a length tie. */
function findSchemeCode(text: string, schemes: SchemeListEntry[]): number | null {
  const normalized = text.toLowerCase().trim();
  let best: { schemeCode: number; length: number; isDirect: boolean } | null = null;
  for (const scheme of schemes) {
    const cleaned = cleanSchemeName(scheme.schemeName);
    if (!normalized.includes(cleaned)) continue;
    const isDirect = scheme.schemeName.toLowerCase().includes("direct plan");
    const isBetter =
      !best ||
      cleaned.length > best.length ||
      (cleaned.length === best.length && isDirect && !best.isDirect);
    if (isBetter) {
      best = { schemeCode: scheme.schemeCode, length: cleaned.length, isDirect };
    }
  }
  return best?.schemeCode ?? null;
}

/**
 * Finds every distinct scheme mentioned in `query`. Real mfapi.in data lists the
 * same fund twice — once as a Direct Plan, once as a Regular Plan — so this
 * de-duplicates by cleaned name, preferring the Direct Plan entry when a query
 * names a fund with no plan qualifier (the common phrasing).
 */
function findAllSchemesInQuery(query: string, schemes: SchemeListEntry[]): number[] {
  const lowerQuery = query.toLowerCase();
  const bestByCleanedName = new Map<string, SchemeListEntry>();
  for (const scheme of schemes) {
    const cleaned = cleanSchemeName(scheme.schemeName);
    if (!lowerQuery.includes(cleaned)) continue;
    const existing = bestByCleanedName.get(cleaned);
    const isDirect = scheme.schemeName.toLowerCase().includes("direct plan");
    const existingIsDirect = existing?.schemeName.toLowerCase().includes("direct plan") ?? false;
    if (!existing || (isDirect && !existingIsDirect)) {
      bestByCleanedName.set(cleaned, scheme);
    }
  }
  return Array.from(bestByCleanedName.values()).map((s) => s.schemeCode);
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
    const schemeCodes = schemes
      .filter((s) => s.schemeName.toLowerCase().includes(category))
      .map((s) => s.schemeCode);
    return { type: "category_ranking", schemeCodes, category };
  }

  const schemeCodes = findAllSchemesInQuery(query, schemes);
  return { type: "single_fund", schemeCodes };
}
