export interface SchemeListEntry {
  schemeCode: number;
  schemeName: string;
}

export interface NavPoint {
  date: string; // "DD-MM-YYYY"
  nav: number;
}

export interface SchemeMeta {
  fund_house: string;
  scheme_type: string;
  scheme_category: string;
  scheme_code: number;
  scheme_name: string;
}

export interface SchemeNavResponse {
  meta: SchemeMeta;
  data: NavPoint[];
}

const BASE_URL = "https://api.mfapi.in/mf";

// The full scheme list is ~75,000 entries and changes rarely (new funds launch
// occasionally, not minute-to-minute) -- without caching, every single /api/agent
// request re-fetches the whole list from mfapi.in, adding latency and making every
// request depend on that external API's uptime even when nothing about the fund
// list has changed. An hour-long cache is generous enough to matter but short
// enough that a newly-added or renamed fund shows up without a server restart.
const SCHEME_LIST_CACHE_TTL_MS = 60 * 60 * 1000;
let schemeListCache: { data: SchemeListEntry[]; fetchedAt: number } | null = null;

export async function fetchSchemeList(): Promise<SchemeListEntry[]> {
  if (schemeListCache && Date.now() - schemeListCache.fetchedAt < SCHEME_LIST_CACHE_TTL_MS) {
    return schemeListCache.data;
  }
  const res = await fetch(BASE_URL);
  if (!res.ok) {
    throw new Error(`mfapi.in scheme list request failed: ${res.status}`);
  }
  const data: SchemeListEntry[] = await res.json();
  schemeListCache = { data, fetchedAt: Date.now() };
  return data;
}

export function clearSchemeListCache(): void {
  schemeListCache = null;
}

export async function fetchSchemeNav(schemeCode: number): Promise<SchemeNavResponse> {
  const res = await fetch(`${BASE_URL}/${schemeCode}`);
  if (!res.ok) {
    throw new Error(`mfapi.in scheme NAV request failed: ${res.status}`);
  }
  const raw: {
    meta: SchemeMeta;
    data: Array<{ date: string; nav: string }>;
  } = await res.json();
  return {
    meta: raw.meta,
    data: raw.data.map((point) => ({ date: point.date, nav: Number(point.nav) })),
  };
}
