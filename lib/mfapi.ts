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

export async function fetchSchemeList(): Promise<SchemeListEntry[]> {
  const res = await fetch(BASE_URL);
  if (!res.ok) {
    throw new Error(`mfapi.in scheme list request failed: ${res.status}`);
  }
  return res.json();
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
