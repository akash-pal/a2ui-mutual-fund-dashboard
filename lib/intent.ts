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

/** Finds the scheme whose (cleaned) name appears inside `text`, preferring the longest match. */
function findSchemeCode(text: string, schemes: SchemeListEntry[]): number | null {
  const normalized = text.toLowerCase().trim();
  let best: { schemeCode: number; length: number } | null = null;
  for (const scheme of schemes) {
    const cleaned = cleanSchemeName(scheme.schemeName);
    if (normalized.includes(cleaned) && (!best || cleaned.length > best.length)) {
      best = { schemeCode: scheme.schemeCode, length: cleaned.length };
    }
  }
  return best?.schemeCode ?? null;
}

function findAllSchemesInQuery(query: string, schemes: SchemeListEntry[]): number[] {
  const lowerQuery = query.toLowerCase();
  const matches: number[] = [];
  for (const scheme of schemes) {
    if (lowerQuery.includes(cleanSchemeName(scheme.schemeName))) {
      matches.push(scheme.schemeCode);
    }
  }
  return matches;
}

export function resolveIntent(query: string, schemes: SchemeListEntry[]): ResolvedIntent {
  const lowerQuery = query.toLowerCase();

  const comparisonSplit = lowerQuery.split(/\bvs\b|\bversus\b/);
  if (comparisonSplit.length >= 2) {
    const schemeCodes = comparisonSplit
      .map((part) => findSchemeCode(part, schemes))
      .filter((code): code is number => code !== null);
    if (schemeCodes.length >= 2) {
      return { type: "compare_funds", schemeCodes };
    }
  }

  const category = CATEGORY_KEYWORDS.find((keyword) => lowerQuery.includes(keyword));
  if (category && /\bbest\b|\btop\b/.test(lowerQuery)) {
    const schemeCodes = schemes
      .filter((s) => s.schemeName.toLowerCase().includes(category))
      .map((s) => s.schemeCode);
    return { type: "category_ranking", schemeCodes, category };
  }

  const schemeCodes = findAllSchemesInQuery(query, schemes);
  return { type: "single_fund", schemeCodes };
}
