# A2UI Mutual Fund Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js app where an LLM agent composes a fixed five-component catalog (via the real `@a2ui/react` / `@a2ui/web_core` A2UI v0.9 protocol) into surfaces that answer natural-language questions about Indian mutual funds, with a schema cache that reuses agent-composed structure across requests while always fetching fresh data.

**Architecture:** A Next.js route handler resolves the user's query into one of three intents (single fund, compare funds, category ranking) using a deterministic classifier (no LLM). It looks up a schema cache keyed on intent type; on a miss it calls an LLM via the Vercel AI SDK's `generateObject` to produce real A2UI `createSurface`/`updateComponents` messages (validated against our five-component catalog) and caches them; on a hit it reuses them. Either way, the actual numbers (NAV-derived metrics, deterministically templated insight text) are computed fresh every request from `mfapi.in` data and sent as a separate `updateDataModel` message the LLM never touches. The client feeds all messages into a real `@a2ui/web_core` `MessageProcessor` and renders the resulting surfaces with `@a2ui/react`'s `A2uiSurface`.

**Tech Stack:** Next.js 15 (App Router, TypeScript, React 19), Tailwind + shadcn/ui, TanStack Table, Recharts, `@a2ui/react` + `@a2ui/web_core` (A2UI v0.9), `ai` (Vercel AI SDK v7) + `zod`, Vitest + React Testing Library.

**Spec:** `docs/adr/0001-mutual-fund-a2ui-dashboard-architecture.md`

## Refinements from the ADR (found during protocol research)

The ADR's phrasing ("on miss, the LLM produces schema and data together") was written before the real `@a2ui/web_core` wire protocol was inspected. Two refinements, both strictly better and both still faithful to the ADR's actual intent (cache structure, never cache data, never let the LLM invent numbers):

1. **The LLM never emits literal numbers.** Every data-bearing component prop is a `{path: "..."}` binding (`CommonSchemas.DataBinding`), not a literal value. The real protocol ships a purpose-built `UpdateDataModelMessage` for exactly this split — it's the mechanism the ADR's caching argument was describing all along. Our own code (`lib/metrics.ts`, `lib/insights.ts`) always builds the `updateDataModel` message fresh, on every request, whether the schema was a cache hit or miss. This also means insight commentary is a **deterministic template**, not a second LLM call — nothing in the ADR called for an LLM-written insight, and this keeps "cache hit → zero LLM calls" literally true.
2. **One root component per surface, multiple surfaces per intent, no container component.** The real protocol requires exactly one component with `id: "root"` per `updateComponents` call, which normally implies a container/children mechanism to nest more than one component. Rather than invent a sixth, purely-structural component (breaking the ADR's "five components"), each intent renders as **multiple single-component surfaces** stacked by our own page layout: `single_fund` → 3 surfaces (StatCard, NavChart, InsightCallout); `compare_funds` → 2 surfaces (ComparisonTable, InsightCallout); `category_ranking` → 2 surfaces (RankedList, InsightCallout). The ADR's five components are unchanged; this only affects how they're wired together on a page.

## Global Constraints

- Personal demo/prototype: no auth, no multi-tenancy, single user (per ADR Context #1).
- Data source is `mfapi.in` only: no API key, no rate limit, NAV history + basic scheme metadata, no holdings/expense ratio/AUM (per ADR Context #2).
- No separate agent backend or AG-UI/CopilotKit runtime — the agent is a Next.js route handler calling the Vercel AI SDK directly (per ADR Decision / Option B).
- Design system is shadcn/ui + Tailwind, with TanStack Table and Recharts (per ADR Decision).
- The component catalog is exactly five components: `StatCard`, `NavChart`, `ComparisonTable`, `RankedList`, `InsightCallout` (per ADR Decision).
- Schema cache key is `{intentType}:{catalogVersion}` — no tenant/role dimension needed for a single-user app (per ADR Decision, scoped down).
- Package manager: npm. Test runner: Vitest + React Testing Library, `jsdom` environment.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder), `vitest.config.ts`, `vitest.setup.ts`, `.env.example`, `.gitignore`
- Test: `lib/sanity.test.ts`

**Interfaces:**
- Produces: a working `npm run dev`, `npm test`, `npm run build` toolchain every later task relies on.

- [ ] **Step 1: Scaffold Next.js**

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --eslint --use-npm
```
Accept defaults for anything else prompted.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install @a2ui/react@^0.11 @a2ui/web_core@^0.11 zod ai @ai-sdk/anthropic @ai-sdk/openai @tanstack/react-table recharts
```

- [ ] **Step 3: Install dev/test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 4: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input card table
```

- [ ] **Step 5: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

Create `vitest.setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 6: Write the failing sanity test**

`lib/sanity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("toolchain sanity", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run tests to verify the toolchain works**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 8: Create `.env.example`**

```
# One of: anthropic | openai
MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

- [ ] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, shadcn/ui, and Vitest

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `lib/mfapi.ts` — mfapi.in client

**Files:**
- Create: `lib/mfapi.ts`
- Test: `lib/mfapi.test.ts`

**Interfaces:**
- Produces: `SchemeListEntry { schemeCode: number; schemeName: string }`, `NavPoint { date: string; nav: number }`, `SchemeMeta { fund_house: string; scheme_type: string; scheme_category: string; scheme_code: number; scheme_name: string }`, `SchemeNavResponse { meta: SchemeMeta; data: NavPoint[] }`, `fetchSchemeList(): Promise<SchemeListEntry[]>`, `fetchSchemeNav(schemeCode: number): Promise<SchemeNavResponse>`.

- [ ] **Step 1: Write the failing tests**

`lib/mfapi.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchSchemeList, fetchSchemeNav } from "./mfapi";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchSchemeList", () => {
  it("fetches and returns the scheme list", async () => {
    const mockData = [
      { schemeCode: 100001, schemeName: "Example Flexi Cap Fund" },
      { schemeCode: 100002, schemeName: "Example Large Cap Fund" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })
    );

    const result = await fetchSchemeList();

    expect(fetch).toHaveBeenCalledWith("https://api.mfapi.in/mf");
    expect(result).toEqual(mockData);
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    await expect(fetchSchemeList()).rejects.toThrow("mfapi.in scheme list request failed: 500");
  });
});

describe("fetchSchemeNav", () => {
  it("fetches and returns NAV history for a scheme", async () => {
    const mockResponse = {
      meta: {
        fund_house: "Example AMC",
        scheme_type: "Open Ended",
        scheme_category: "Flexi Cap Fund",
        scheme_code: 100001,
        scheme_name: "Example Flexi Cap Fund",
      },
      data: [
        { date: "23-09-2026", nav: "142.5000" },
        { date: "22-09-2026", nav: "141.8000" },
      ],
      status: "SUCCESS",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    );

    const result = await fetchSchemeNav(100001);

    expect(fetch).toHaveBeenCalledWith("https://api.mfapi.in/mf/100001");
    expect(result.meta.scheme_name).toBe("Example Flexi Cap Fund");
    expect(result.data).toEqual([
      { date: "23-09-2026", nav: 142.5 },
      { date: "22-09-2026", nav: 141.8 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/mfapi.test.ts`
Expected: FAIL — `lib/mfapi.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`lib/mfapi.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/mfapi.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/mfapi.ts lib/mfapi.test.ts
git commit -m "feat: add mfapi.in client for scheme list and NAV history

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `lib/metrics.ts` — NAV-derived metrics

**Files:**
- Create: `lib/metrics.ts`
- Test: `lib/metrics.test.ts`

**Interfaces:**
- Consumes: `NavPoint` from `lib/mfapi.ts`.
- Produces: `TrailingReturns { "1M": number | null; "3M": number | null; "1Y": number | null; "3Y": number | null; "5Y": number | null }`, `computeTrailingReturns(nav: NavPoint[], asOf?: Date): TrailingReturns`, `computeCAGR(nav: NavPoint[], years: number, asOf?: Date): number | null`, `computeVolatility(nav: NavPoint[]): number | null`, `computeMaxDrawdown(nav: NavPoint[]): number | null`.

- [ ] **Step 1: Write the failing tests**

`lib/metrics.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/metrics.test.ts`
Expected: FAIL — `lib/metrics.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`lib/metrics.ts`:

```typescript
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
  const target = new Date(asOf);
  target.setMonth(target.getMonth() - monthsBack);
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
  const target = new Date(asOf);
  target.setFullYear(target.getFullYear() - years);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/metrics.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/metrics.ts lib/metrics.test.ts
git commit -m "feat: add NAV-derived metrics (trailing returns, CAGR, volatility, drawdown)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `lib/insights.ts` — deterministic insight text

**Files:**
- Create: `lib/insights.ts`
- Test: `lib/insights.test.ts`

**Interfaces:**
- Consumes: `TrailingReturns` from `lib/metrics.ts`.
- Produces: `generateSingleFundInsight(fundName: string, returns: TrailingReturns): string`, `generateComparisonInsight(rows: Array<{ name: string; oneYearReturn: number | null }>): string`, `generateRankingInsight(category: string, items: Array<{ name: string; oneYearReturn: number | null }>): string`.

- [ ] **Step 1: Write the failing tests**

`lib/insights.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  generateSingleFundInsight,
  generateComparisonInsight,
  generateRankingInsight,
} from "./insights";

describe("generateSingleFundInsight", () => {
  it("mentions the fund name and 1-year return when available", () => {
    const text = generateSingleFundInsight("Example Flexi Cap Fund", {
      "1M": 1.2,
      "3M": 3.4,
      "1Y": 18.4,
      "3Y": null,
      "5Y": null,
    });
    expect(text).toContain("Example Flexi Cap Fund");
    expect(text).toContain("18.4");
  });

  it("falls back gracefully when 1-year data is unavailable", () => {
    const text = generateSingleFundInsight("New Fund", {
      "1M": 0.5,
      "3M": null,
      "1Y": null,
      "3Y": null,
      "5Y": null,
    });
    expect(text).toContain("New Fund");
    expect(text).not.toContain("null");
  });
});

describe("generateComparisonInsight", () => {
  it("names the best performer by 1-year return", () => {
    const text = generateComparisonInsight([
      { name: "Fund A", oneYearReturn: 12 },
      { name: "Fund B", oneYearReturn: 22 },
      { name: "Fund C", oneYearReturn: 5 },
    ]);
    expect(text).toContain("Fund B");
  });
});

describe("generateRankingInsight", () => {
  it("mentions the category and the top fund", () => {
    const text = generateRankingInsight("Large Cap", [
      { name: "Top Fund", oneYearReturn: 20 },
      { name: "Second Fund", oneYearReturn: 15 },
    ]);
    expect(text).toContain("Large Cap");
    expect(text).toContain("Top Fund");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/insights.test.ts`
Expected: FAIL — `lib/insights.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`lib/insights.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/insights.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/insights.ts lib/insights.test.ts
git commit -m "feat: add deterministic insight text generation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `lib/cache.ts` — schema cache

**Files:**
- Create: `lib/cache.ts`
- Test: `lib/cache.test.ts`

**Interfaces:**
- Produces: `CATALOG_VERSION: string`, `buildCacheKey(intentType: string): string`, `getCachedSchema<T>(key: string): T | undefined`, `setCachedSchema<T>(key: string, value: T): void`, `clearSchemaCache(): void`.

- [ ] **Step 1: Write the failing tests**

`lib/cache.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { buildCacheKey, getCachedSchema, setCachedSchema, clearSchemaCache, CATALOG_VERSION } from "./cache";

beforeEach(() => {
  clearSchemaCache();
});

describe("buildCacheKey", () => {
  it("includes the intent type and catalog version", () => {
    const key = buildCacheKey("single_fund");
    expect(key).toBe(`single_fund:${CATALOG_VERSION}`);
  });

  it("produces different keys for different intent types", () => {
    expect(buildCacheKey("single_fund")).not.toBe(buildCacheKey("compare_funds"));
  });
});

describe("getCachedSchema / setCachedSchema", () => {
  it("returns undefined for a key that was never set", () => {
    expect(getCachedSchema(buildCacheKey("single_fund"))).toBeUndefined();
  });

  it("returns what was stored for a given key", () => {
    const key = buildCacheKey("single_fund");
    const value = { hello: "world" };
    setCachedSchema(key, value);
    expect(getCachedSchema(key)).toEqual(value);
  });

  it("does not leak values across different keys", () => {
    setCachedSchema(buildCacheKey("single_fund"), { a: 1 });
    expect(getCachedSchema(buildCacheKey("compare_funds"))).toBeUndefined();
  });
});

describe("clearSchemaCache", () => {
  it("removes all cached entries", () => {
    setCachedSchema(buildCacheKey("single_fund"), { a: 1 });
    clearSchemaCache();
    expect(getCachedSchema(buildCacheKey("single_fund"))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/cache.test.ts`
Expected: FAIL — `lib/cache.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`lib/cache.ts`:

```typescript
export const CATALOG_VERSION = "v1";

const schemaCache = new Map<string, unknown>();

export function buildCacheKey(intentType: string): string {
  return `${intentType}:${CATALOG_VERSION}`;
}

export function getCachedSchema<T>(key: string): T | undefined {
  return schemaCache.get(key) as T | undefined;
}

export function setCachedSchema<T>(key: string, value: T): void {
  schemaCache.set(key, value);
}

export function clearSchemaCache(): void {
  schemaCache.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/cache.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/cache.ts lib/cache.test.ts
git commit -m "feat: add in-memory schema cache keyed on intent type and catalog version

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `lib/intent.ts` — deterministic intent resolution

**Files:**
- Create: `lib/intent.ts`
- Test: `lib/intent.test.ts`

**Interfaces:**
- Consumes: `SchemeListEntry` from `lib/mfapi.ts`.
- Produces: `IntentType = "single_fund" | "compare_funds" | "category_ranking"`, `ResolvedIntent { type: IntentType; schemeCodes: number[]; category?: string }`, `resolveIntent(query: string, schemes: SchemeListEntry[]): ResolvedIntent`.

- [ ] **Step 1: Write the failing tests**

`lib/intent.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveIntent } from "./intent";
import type { SchemeListEntry } from "./mfapi";

const schemes: SchemeListEntry[] = [
  { schemeCode: 1, schemeName: "Example Flexi Cap Fund - Direct Plan" },
  { schemeCode: 2, schemeName: "Example Large Cap Fund - Direct Plan" },
  { schemeCode: 3, schemeName: "Example Small Cap Fund - Direct Plan" },
];

describe("resolveIntent", () => {
  it("resolves a single fund lookup", () => {
    const result = resolveIntent("How has the Example Flexi Cap Fund done?", schemes);
    expect(result.type).toBe("single_fund");
    expect(result.schemeCodes).toEqual([1]);
  });

  it("resolves a comparison query with 'vs'", () => {
    const result = resolveIntent(
      "Compare Example Flexi Cap Fund vs Example Large Cap Fund",
      schemes
    );
    expect(result.type).toBe("compare_funds");
    expect(result.schemeCodes.sort()).toEqual([1, 2]);
  });

  it("resolves a comparison query with 'versus'", () => {
    const result = resolveIntent(
      "Example Large Cap Fund versus Example Small Cap Fund",
      schemes
    );
    expect(result.type).toBe("compare_funds");
    expect(result.schemeCodes.sort()).toEqual([2, 3]);
  });

  it("resolves a category ranking query", () => {
    const result = resolveIntent("Show me the best large cap funds", schemes);
    expect(result.type).toBe("category_ranking");
    expect(result.category).toBe("large cap");
    expect(result.schemeCodes).toContain(2);
  });

  it("falls back to single_fund with an empty match when nothing matches", () => {
    const result = resolveIntent("What's the weather today?", schemes);
    expect(result.type).toBe("single_fund");
    expect(result.schemeCodes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/intent.test.ts`
Expected: FAIL — `lib/intent.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`lib/intent.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/intent.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/intent.ts lib/intent.test.ts
git commit -m "feat: add deterministic intent resolution (no LLM call)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `components/catalog/StatCard.tsx`

**Files:**
- Create: `components/catalog/StatCard.tsx`
- Test: `components/catalog/StatCard.test.tsx`

**Interfaces:**
- Produces: `StatCardPropsSchema` (zod), `StatCardApi: ComponentApi`, `StatCard: ReactComponentImplementation`.

- [ ] **Step 1: Write the failing test**

`components/catalog/StatCard.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCardPropsSchema } from "./StatCard";

describe("StatCardPropsSchema", () => {
  it("accepts a literal label, value, and trend", () => {
    const result = StatCardPropsSchema.safeParse({
      label: "1-Year Return",
      value: "+18.4%",
      trend: "up",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a path-bound value", () => {
    const result = StatCardPropsSchema.safeParse({
      label: "1-Year Return",
      value: { path: "/statValue" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing label", () => {
    const result = StatCardPropsSchema.safeParse({ value: "+18.4%" });
    expect(result.success).toBe(false);
  });
});
```

Note: this task tests only the Zod schema in isolation. The `ReactComponentImplementation`'s actual rendering is exercised end-to-end in Task 12's `MessageProcessor` test, since `createComponentImplementation`'s output isn't a plain React component you can `render()` directly — it's driven by `A2uiSurface` from a resolved `ComponentNode`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/catalog/StatCard.test.tsx`
Expected: FAIL — `components/catalog/StatCard.tsx` does not exist.

- [ ] **Step 3: Write the implementation**

`components/catalog/StatCard.tsx`:

```tsx
import { z } from "zod";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const StatCardPropsSchema = z.object({
  label: CommonSchemas.DynamicString,
  value: CommonSchemas.DynamicString,
  trend: CommonSchemas.DynamicString.optional(),
});

export const StatCardApi: ComponentApi<typeof StatCardPropsSchema> = {
  name: "StatCard",
  schema: StatCardPropsSchema,
};

export const StatCard = createComponentImplementation(StatCardApi, ({ props }) => {
  const trendColor =
    props.trend === "up" ? "text-green-600" : props.trend === "down" ? "text-red-600" : "text-gray-600";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{props.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold ${trendColor}`}>{props.value}</p>
      </CardContent>
    </Card>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/catalog/StatCard.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add components/catalog/StatCard.tsx components/catalog/StatCard.test.tsx
git commit -m "feat: add StatCard catalog component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: `components/catalog/NavChart.tsx`

**Files:**
- Create: `components/catalog/NavChart.tsx`
- Test: `components/catalog/NavChart.test.tsx`

**Interfaces:**
- Produces: `NavChartPropsSchema`, `NavChartApi: ComponentApi`, `NavChart: ReactComponentImplementation`.

- [ ] **Step 1: Write the failing test**

`components/catalog/NavChart.test.tsx`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/catalog/NavChart.test.tsx`
Expected: FAIL — `components/catalog/NavChart.tsx` does not exist.

- [ ] **Step 3: Write the implementation**

`components/catalog/NavChart.tsx`:

```tsx
import { z } from "zod";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const NavChartPropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  points: CommonSchemas.DataBinding, // always {path}: real numbers are never literals
});

export const NavChartApi: ComponentApi<typeof NavChartPropsSchema> = {
  name: "NavChart",
  schema: NavChartPropsSchema,
};

export const NavChart = createComponentImplementation(NavChartApi, ({ props }) => {
  const points = (props.points as Array<{ date: string; nav: number }>) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={points}>
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} width={50} />
            <Tooltip />
            <Line type="monotone" dataKey="nav" stroke="#2563eb" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/catalog/NavChart.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add components/catalog/NavChart.tsx components/catalog/NavChart.test.tsx
git commit -m "feat: add NavChart catalog component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `components/catalog/ComparisonTable.tsx`

**Files:**
- Create: `components/catalog/ComparisonTable.tsx`
- Test: `components/catalog/ComparisonTable.test.tsx`

**Interfaces:**
- Produces: `ComparisonTablePropsSchema`, `ComparisonTableApi: ComponentApi`, `ComparisonTable: ReactComponentImplementation`.

- [ ] **Step 1: Write the failing test**

`components/catalog/ComparisonTable.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { ComparisonTablePropsSchema } from "./ComparisonTable";

describe("ComparisonTablePropsSchema", () => {
  it("accepts literal column headers and a path-bound rows array", () => {
    const result = ComparisonTablePropsSchema.safeParse({
      title: "Fund Comparison",
      columns: ["Fund", "1Y Return", "3Y Return"],
      rows: { path: "/rows" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects literal rows (rows must always be path-bound)", () => {
    const result = ComparisonTablePropsSchema.safeParse({
      title: "Fund Comparison",
      columns: ["Fund", "1Y Return"],
      rows: [["Fund A", "12%"]],
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one column", () => {
    const result = ComparisonTablePropsSchema.safeParse({
      title: "Fund Comparison",
      columns: [],
      rows: { path: "/rows" },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/catalog/ComparisonTable.test.tsx`
Expected: FAIL — `components/catalog/ComparisonTable.tsx` does not exist.

- [ ] **Step 3: Write the implementation**

`components/catalog/ComparisonTable.tsx`:

```tsx
import { z } from "zod";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const ComparisonTablePropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  columns: z.array(z.string()).min(1),
  rows: CommonSchemas.DataBinding, // always {path}: real values are never literals
});

export const ComparisonTableApi: ComponentApi<typeof ComparisonTablePropsSchema> = {
  name: "ComparisonTable",
  schema: ComparisonTablePropsSchema,
};

export const ComparisonTable = createComponentImplementation(ComparisonTableApi, ({ props }) => {
  const rows = (props.rows as Array<Array<string | number>>) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {props.columns.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell key={j}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/catalog/ComparisonTable.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add components/catalog/ComparisonTable.tsx components/catalog/ComparisonTable.test.tsx
git commit -m "feat: add ComparisonTable catalog component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: `components/catalog/RankedList.tsx`

**Files:**
- Create: `components/catalog/RankedList.tsx`
- Test: `components/catalog/RankedList.test.tsx`

**Interfaces:**
- Produces: `RankedListPropsSchema`, `RankedListApi: ComponentApi`, `RankedList: ReactComponentImplementation`.

- [ ] **Step 1: Write the failing test**

`components/catalog/RankedList.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { RankedListPropsSchema } from "./RankedList";

describe("RankedListPropsSchema", () => {
  it("accepts a literal title and a path-bound items array", () => {
    const result = RankedListPropsSchema.safeParse({
      title: "Top Large Cap Funds",
      items: { path: "/items" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a literal items array", () => {
    const result = RankedListPropsSchema.safeParse({
      title: "Top Large Cap Funds",
      items: [{ name: "Fund A", value: "12%" }],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/catalog/RankedList.test.tsx`
Expected: FAIL — `components/catalog/RankedList.tsx` does not exist.

- [ ] **Step 3: Write the implementation**

`components/catalog/RankedList.tsx`:

```tsx
import { z } from "zod";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const RankedListPropsSchema = z.object({
  title: CommonSchemas.DynamicString,
  items: CommonSchemas.DataBinding, // always {path}: real values are never literals
});

export const RankedListApi: ComponentApi<typeof RankedListPropsSchema> = {
  name: "RankedList",
  schema: RankedListPropsSchema,
};

export const RankedList = createComponentImplementation(RankedListApi, ({ props }) => {
  const items = (props.items as Array<{ name: string; value: string }>) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {items.map((item, i) => (
            <li key={item.name} className="flex justify-between border-b pb-1">
              <span>
                {i + 1}. {item.name}
              </span>
              <span className="font-medium">{item.value}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/catalog/RankedList.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add components/catalog/RankedList.tsx components/catalog/RankedList.test.tsx
git commit -m "feat: add RankedList catalog component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: `components/catalog/InsightCallout.tsx`

**Files:**
- Create: `components/catalog/InsightCallout.tsx`
- Test: `components/catalog/InsightCallout.test.tsx`

**Interfaces:**
- Produces: `InsightCalloutPropsSchema`, `InsightCalloutApi: ComponentApi`, `InsightCallout: ReactComponentImplementation`.

- [ ] **Step 1: Write the failing test**

`components/catalog/InsightCallout.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { InsightCalloutPropsSchema } from "./InsightCallout";

describe("InsightCalloutPropsSchema", () => {
  it("accepts a path-bound text field", () => {
    const result = InsightCalloutPropsSchema.safeParse({ text: { path: "/insightText" } });
    expect(result.success).toBe(true);
  });

  it("rejects literal text (insight copy is always path-bound and computed fresh)", () => {
    const result = InsightCalloutPropsSchema.safeParse({ text: "This fund did well." });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/catalog/InsightCallout.test.tsx`
Expected: FAIL — `components/catalog/InsightCallout.tsx` does not exist.

- [ ] **Step 3: Write the implementation**

`components/catalog/InsightCallout.tsx`:

```tsx
import { z } from "zod";
import { CommonSchemas, type ComponentApi } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";

export const InsightCalloutPropsSchema = z.object({
  text: CommonSchemas.DataBinding, // always {path}: deterministically templated, never LLM-authored
});

export const InsightCalloutApi: ComponentApi<typeof InsightCalloutPropsSchema> = {
  name: "InsightCallout",
  schema: InsightCalloutPropsSchema,
};

export const InsightCallout = createComponentImplementation(InsightCalloutApi, ({ props }) => {
  return (
    <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900">
      {props.text as string}
    </div>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/catalog/InsightCallout.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add components/catalog/InsightCallout.tsx components/catalog/InsightCallout.test.tsx
git commit -m "feat: add InsightCallout catalog component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: `lib/catalog.ts` — wire schema and runtime catalog

**Files:**
- Create: `lib/catalog.ts`
- Test: `lib/catalog.test.ts`

**Interfaces:**
- Consumes: `StatCardPropsSchema`/`StatCard`, `NavChartPropsSchema`/`NavChart`, `ComparisonTablePropsSchema`/`ComparisonTable`, `RankedListPropsSchema`/`RankedList`, `InsightCalloutPropsSchema`/`InsightCallout` from `components/catalog/*.tsx`.
- Produces: `CATALOG_ID: string`, `appCatalog: Catalog<ReactComponentImplementation>`, `AnyCatalogComponentSchema` (zod discriminated union), `A2uiMessageSchema` (zod), `type A2uiMessage`.

- [ ] **Step 1: Write the failing tests**

`lib/catalog.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { appCatalog, CATALOG_ID, A2uiMessageSchema } from "./catalog";

describe("appCatalog", () => {
  it("registers exactly the five catalog components", () => {
    const names = Array.from(appCatalog.components.keys()).sort();
    expect(names).toEqual(
      ["ComparisonTable", "InsightCallout", "NavChart", "RankedList", "StatCard"].sort()
    );
  });
});

describe("A2uiMessageSchema", () => {
  it("validates a createSurface message", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      createSurface: { surfaceId: "stat", catalogId: CATALOG_ID },
    });
    expect(result.success).toBe(true);
  });

  it("validates an updateComponents message with a single StatCard root", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [
          { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" } },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an updateComponents message with no root component", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [
          { component: "StatCard", id: "not-root", label: "1-Year Return", value: { path: "/statValue" } },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown component name", () => {
    const result = A2uiMessageSchema.safeParse({
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [{ component: "NotARealComponent", id: "root" }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("MessageProcessor integration", () => {
  it("creates a surface from createSurface + updateComponents messages", () => {
    const processor = new MessageProcessor([appCatalog]);
    processor.processMessages([
      { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "stat",
          components: [
            { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" } },
          ],
        },
      },
      { version: "v0.9", updateDataModel: { surfaceId: "stat", value: { statValue: "+18.4%" } } },
    ]);
    expect(processor.model.surfacesMap.size).toBe(1);
    expect(processor.model.surfacesMap.has("stat")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/catalog.test.ts`
Expected: FAIL — `lib/catalog.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`lib/catalog.ts`:

```typescript
import { z } from "zod";
import { Catalog, type ComponentApi } from "@a2ui/web_core/v0_9";
import { StatCardApi, StatCard, StatCardPropsSchema } from "@/components/catalog/StatCard";
import { NavChartApi, NavChart, NavChartPropsSchema } from "@/components/catalog/NavChart";
import {
  ComparisonTableApi,
  ComparisonTable,
  ComparisonTablePropsSchema,
} from "@/components/catalog/ComparisonTable";
import { RankedListApi, RankedList, RankedListPropsSchema } from "@/components/catalog/RankedList";
import {
  InsightCalloutApi,
  InsightCallout,
  InsightCalloutPropsSchema,
} from "@/components/catalog/InsightCallout";

export const CATALOG_ID = "a2ui-mutual-fund-dashboard.local:v1";

export const appCatalog = new Catalog(
  CATALOG_ID,
  [StatCard, NavChart, ComparisonTable, RankedList, InsightCallout] as unknown as ComponentApi[],
  []
);

const envelope = { id: z.string().optional(), weight: z.number().optional() };

const AnyCatalogComponentSchema = z.discriminatedUnion("component", [
  z.object({ component: z.literal(StatCardApi.name), ...envelope, ...StatCardPropsSchema.shape }),
  z.object({ component: z.literal(NavChartApi.name), ...envelope, ...NavChartPropsSchema.shape }),
  z.object({
    component: z.literal(ComparisonTableApi.name),
    ...envelope,
    ...ComparisonTablePropsSchema.shape,
  }),
  z.object({ component: z.literal(RankedListApi.name), ...envelope, ...RankedListPropsSchema.shape }),
  z.object({
    component: z.literal(InsightCalloutApi.name),
    ...envelope,
    ...InsightCalloutPropsSchema.shape,
  }),
]);

export { AnyCatalogComponentSchema };

const CreateSurfaceMessageSchema = z.object({
  version: z.literal("v0.9"),
  createSurface: z.object({
    surfaceId: z.string(),
    catalogId: z.string(),
  }),
});

const UpdateComponentsMessageSchema = z.object({
  version: z.literal("v0.9"),
  updateComponents: z
    .object({
      surfaceId: z.string(),
      components: z.array(AnyCatalogComponentSchema).min(1),
    })
    .refine((val) => val.components.some((c) => c.id === "root"), {
      message: "updateComponents.components must include exactly one component with id 'root'",
    }),
});

const UpdateDataModelMessageSchema = z.object({
  version: z.literal("v0.9"),
  updateDataModel: z.object({
    surfaceId: z.string(),
    path: z.string().optional(),
    value: z.record(z.string(), z.unknown()),
  }),
});

export const A2uiMessageSchema = z.union([
  CreateSurfaceMessageSchema,
  UpdateComponentsMessageSchema,
  UpdateDataModelMessageSchema,
]);

export type A2uiMessage = z.infer<typeof A2uiMessageSchema>;
export type CreateSurfaceMessage = z.infer<typeof CreateSurfaceMessageSchema>;
export type UpdateComponentsMessage = z.infer<typeof UpdateComponentsMessageSchema>;
export type UpdateDataModelMessage = z.infer<typeof UpdateDataModelMessageSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/catalog.test.ts`
Expected: 6 passed.

If `MessageProcessor` from `@a2ui/web_core/v0_9` rejects the hand-built messages in the integration test, read `node_modules/@a2ui/web_core/src/v0_9/processing/message-processor.test.js` in the installed package for a working example and adjust the test's message shapes to match — the JSON Schema in `node_modules/@a2ui/web_core/src/v0_9/schemas/server_to_client.json` is the ground truth for exact field names.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog.ts lib/catalog.test.ts
git commit -m "feat: wire the five-component catalog into the real A2UI runtime catalog and message schema

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: `lib/llm.ts` — provider-agnostic model selection

**Files:**
- Create: `lib/llm.ts`
- Test: `lib/llm.test.ts`

**Interfaces:**
- Produces: `getModel(): LanguageModel` (from the `ai` package's model type).

- [ ] **Step 1: Write the failing tests**

`lib/llm.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getModel", () => {
  it("returns an anthropic model when MODEL_PROVIDER=anthropic", async () => {
    process.env.MODEL_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { getModel } = await import("./llm");
    const model = getModel();
    expect(model.provider).toContain("anthropic");
  });

  it("returns an openai model when MODEL_PROVIDER=openai", async () => {
    process.env.MODEL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const { getModel } = await import("./llm");
    const model = getModel();
    expect(model.provider).toContain("openai");
  });

  it("throws a clear error for an unknown provider", async () => {
    process.env.MODEL_PROVIDER = "not-a-provider";
    const { getModel } = await import("./llm");
    expect(() => getModel()).toThrow(/Unknown MODEL_PROVIDER/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/llm.test.ts`
Expected: FAIL — `lib/llm.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`lib/llm.ts`:

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export function getModel(): LanguageModel {
  const provider = process.env.MODEL_PROVIDER ?? "anthropic";
  switch (provider) {
    case "anthropic":
      return anthropic("claude-sonnet-5");
    case "openai":
      return openai("gpt-5");
    default:
      throw new Error(`Unknown MODEL_PROVIDER: "${provider}". Expected "anthropic" or "openai".`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/llm.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/llm.ts lib/llm.test.ts
git commit -m "feat: add provider-agnostic model selection via Vercel AI SDK

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: `lib/agent.ts` — orchestration (cache + LLM + fresh data)

**Files:**
- Create: `lib/agent.ts`
- Test: `lib/agent.test.ts`

**Interfaces:**
- Consumes: `ResolvedIntent`/`IntentType` from `lib/intent.ts`; `buildCacheKey`/`getCachedSchema`/`setCachedSchema` from `lib/cache.ts`; `A2uiMessage`/`A2uiMessageSchema`/`CATALOG_ID` from `lib/catalog.ts`; `getModel` from `lib/llm.ts`; `fetchSchemeNav` from `lib/mfapi.ts`; `computeTrailingReturns` from `lib/metrics.ts`; `generateSingleFundInsight`/`generateComparisonInsight`/`generateRankingInsight` from `lib/insights.ts`.
- Produces: `buildA2uiResponse(intent: ResolvedIntent): Promise<A2uiMessage[]>`.

- [ ] **Step 1: Write the failing tests**

`lib/agent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { clearSchemaCache, buildCacheKey, getCachedSchema } from "./cache";

vi.mock("./llm", () => ({
  getModel: vi.fn(),
}));
vi.mock("./mfapi", () => ({
  fetchSchemeNav: vi.fn(),
}));

import { getModel } from "./llm";
import { fetchSchemeNav } from "./mfapi";
import { buildA2uiResponse } from "./agent";

const SINGLE_FUND_STRUCTURE = {
  messages: [
    { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "stat",
        components: [
          { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" } },
        ],
      },
    },
    { version: "v0.9", createSurface: { surfaceId: "chart", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "chart",
        components: [
          { component: "NavChart", id: "root", title: "NAV Trend", points: { path: "/navPoints" } },
        ],
      },
    },
    { version: "v0.9", createSurface: { surfaceId: "insight", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "insight",
        components: [
          { component: "InsightCallout", id: "root", text: { path: "/insightText" } },
        ],
      },
    },
  ],
};

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

beforeEach(() => {
  clearSchemaCache();
  // Dates are relative to "now" (not hardcoded) so this test stays correct no matter when it runs —
  // `computeTrailingReturns` inside `buildSingleFundData` defaults its `asOf` to the real wall clock.
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  vi.mocked(fetchSchemeNav).mockResolvedValue({
    meta: {
      fund_house: "Example AMC",
      scheme_type: "Open Ended",
      scheme_category: "Flexi Cap Fund",
      scheme_code: 1,
      scheme_name: "Example Flexi Cap Fund",
    },
    data: [
      { date: formatDate(today), nav: 118.4 },
      { date: formatDate(oneYearAgo), nav: 100 },
    ],
  });
  vi.mocked(getModel).mockReturnValue(
    new MockLanguageModelV4({
      doGenerate: {
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        content: [{ type: "text", text: JSON.stringify(SINGLE_FUND_STRUCTURE) }],
      },
    }) as never
  );
});

describe("buildA2uiResponse", () => {
  it("calls the LLM on a cache miss and returns createSurface/updateComponents/updateDataModel messages", async () => {
    const messages = await buildA2uiResponse({ type: "single_fund", schemeCodes: [1] });

    const kinds = messages.map((m) =>
      "createSurface" in m ? "createSurface" : "updateComponents" in m ? "updateComponents" : "updateDataModel"
    );
    expect(kinds).toContain("createSurface");
    expect(kinds).toContain("updateComponents");
    expect(kinds).toContain("updateDataModel");
  });

  it("stores the schema in the cache after a miss", async () => {
    await buildA2uiResponse({ type: "single_fund", schemeCodes: [1] });
    const cached = getCachedSchema(buildCacheKey("single_fund"));
    expect(cached).toBeDefined();
  });

  it("does not call the LLM again on a cache hit for the same intent type", async () => {
    await buildA2uiResponse({ type: "single_fund", schemeCodes: [1] });
    const model = vi.mocked(getModel).mock.results[0].value as MockLanguageModelV4;
    const callsAfterFirst = model.doGenerateCalls.length;

    await buildA2uiResponse({ type: "single_fund", schemeCodes: [1] });

    expect(model.doGenerateCalls.length).toBe(callsAfterFirst);
  });

  it("always fetches fresh data, even on a cache hit", async () => {
    await buildA2uiResponse({ type: "single_fund", schemeCodes: [1] });
    await buildA2uiResponse({ type: "single_fund", schemeCodes: [1] });
    expect(fetchSchemeNav).toHaveBeenCalledTimes(2);
  });

  it("includes the real computed 1-year return in the updateDataModel message, not a value from the LLM", async () => {
    const messages = await buildA2uiResponse({ type: "single_fund", schemeCodes: [1] });
    const dataMessage = messages.find((m) => "updateDataModel" in m) as {
      updateDataModel: { value: Record<string, unknown> };
    };
    expect(dataMessage.updateDataModel.value.statValue).toBe("+18.4%");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agent.test.ts`
Expected: FAIL — `lib/agent.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`lib/agent.ts`:

```typescript
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./llm";
import { fetchSchemeNav } from "./mfapi";
import { computeTrailingReturns } from "./metrics";
import {
  generateSingleFundInsight,
  generateComparisonInsight,
  generateRankingInsight,
} from "./insights";
import { buildCacheKey, getCachedSchema, setCachedSchema } from "./cache";
import { A2uiMessageSchema, CATALOG_ID, type A2uiMessage } from "./catalog";
import type { ResolvedIntent } from "./intent";

const StructureResponseSchema = z.object({
  messages: z.array(A2uiMessageSchema).min(1),
});

const STRUCTURE_PROMPTS: Record<ResolvedIntent["type"], string> = {
  single_fund: `Produce A2UI v0.9 "messages" for a page with THREE surfaces, in this order:
1. surfaceId "stat": one createSurface + one updateComponents whose single root component is "StatCard", with label as a short literal string (e.g. "1-Year Return") and value bound to {"path":"/statValue"} and trend bound to {"path":"/statTrend"}.
2. surfaceId "chart": one createSurface + one updateComponents whose single root component is "NavChart", with title as a literal string and points bound to {"path":"/navPoints"}.
3. surfaceId "insight": one createSurface + one updateComponents whose single root component is "InsightCallout", with text bound to {"path":"/insightText"}.
Every component's "id" must be "root". catalogId must be "${CATALOG_ID}" for every createSurface. Do not include any updateDataModel messages or literal numeric values.`,
  compare_funds: `Produce A2UI v0.9 "messages" for a page with TWO surfaces, in this order:
1. surfaceId "table": one createSurface + one updateComponents whose single root component is "ComparisonTable", with title as a literal string, columns as a literal array of short header strings (e.g. ["Fund","1Y Return"]), and rows bound to {"path":"/rows"}.
2. surfaceId "insight": one createSurface + one updateComponents whose single root component is "InsightCallout", with text bound to {"path":"/insightText"}.
Every component's "id" must be "root". catalogId must be "${CATALOG_ID}" for every createSurface. Do not include any updateDataModel messages or literal numeric values.`,
  category_ranking: `Produce A2UI v0.9 "messages" for a page with TWO surfaces, in this order:
1. surfaceId "list": one createSurface + one updateComponents whose single root component is "RankedList", with title as a literal string and items bound to {"path":"/items"}.
2. surfaceId "insight": one createSurface + one updateComponents whose single root component is "InsightCallout", with text bound to {"path":"/insightText"}.
Every component's "id" must be "root". catalogId must be "${CATALOG_ID}" for every createSurface. Do not include any updateDataModel messages or literal numeric values.`,
};

async function fetchStructure(intentType: ResolvedIntent["type"]): Promise<A2uiMessage[]> {
  const cacheKey = buildCacheKey(intentType);
  const cached = getCachedSchema<A2uiMessage[]>(cacheKey);
  if (cached) return cached;

  const { object } = await generateObject({
    model: getModel(),
    schema: StructureResponseSchema,
    prompt: STRUCTURE_PROMPTS[intentType],
  });
  setCachedSchema(cacheKey, object.messages);
  return object.messages;
}

function surfaceIdsInOrder(messages: A2uiMessage[]): string[] {
  return messages
    .filter((m): m is Extract<A2uiMessage, { createSurface: unknown }> => "createSurface" in m)
    .map((m) => m.createSurface.surfaceId);
}

async function buildSingleFundData(schemeCodes: number[]) {
  const schemeCode = schemeCodes[0];
  const nav = await fetchSchemeNav(schemeCode);
  const returns = computeTrailingReturns(nav.data);
  const trend = returns["1Y"] === null ? "flat" : returns["1Y"] >= 0 ? "up" : "down";
  const statValue = returns["1Y"] === null ? "N/A" : `${returns["1Y"] >= 0 ? "+" : ""}${returns["1Y"].toFixed(1)}%`;
  return {
    stat: { statValue, statTrend: trend },
    chart: { navPoints: [...nav.data].reverse() },
    insight: { insightText: generateSingleFundInsight(nav.meta.scheme_name, returns) },
  };
}

async function buildCompareFundsData(schemeCodes: number[]) {
  const navs = await Promise.all(schemeCodes.map((code) => fetchSchemeNav(code)));
  const rows = navs.map((nav) => {
    const returns = computeTrailingReturns(nav.data);
    return [
      nav.meta.scheme_name,
      returns["1Y"] === null ? "N/A" : `${returns["1Y"].toFixed(1)}%`,
      returns["3Y"] === null ? "N/A" : `${returns["3Y"].toFixed(1)}%`,
    ];
  });
  const insight = generateComparisonInsight(
    navs.map((nav) => ({
      name: nav.meta.scheme_name,
      oneYearReturn: computeTrailingReturns(nav.data)["1Y"],
    }))
  );
  return {
    table: { rows },
    insight: { insightText: insight },
  };
}

async function buildCategoryRankingData(schemeCodes: number[], category: string | undefined) {
  const navs = await Promise.all(schemeCodes.map((code) => fetchSchemeNav(code)));
  const ranked = navs
    .map((nav) => ({
      name: nav.meta.scheme_name,
      oneYearReturn: computeTrailingReturns(nav.data)["1Y"],
    }))
    .sort((a, b) => (b.oneYearReturn ?? -Infinity) - (a.oneYearReturn ?? -Infinity));
  const items = ranked.map((r) => ({
    name: r.name,
    value: r.oneYearReturn === null ? "N/A" : `${r.oneYearReturn.toFixed(1)}%`,
  }));
  return {
    list: { items },
    insight: { insightText: generateRankingInsight(category ?? "the selected", ranked) },
  };
}

export async function buildA2uiResponse(intent: ResolvedIntent): Promise<A2uiMessage[]> {
  const structure = await fetchStructure(intent.type);
  const surfaceIds = surfaceIdsInOrder(structure);

  let dataBySurface: Record<string, Record<string, unknown>>;
  if (intent.type === "single_fund") {
    const data = await buildSingleFundData(intent.schemeCodes);
    dataBySurface = { [surfaceIds[0]]: data.stat, [surfaceIds[1]]: data.chart, [surfaceIds[2]]: data.insight };
  } else if (intent.type === "compare_funds") {
    const data = await buildCompareFundsData(intent.schemeCodes);
    dataBySurface = { [surfaceIds[0]]: data.table, [surfaceIds[1]]: data.insight };
  } else {
    const data = await buildCategoryRankingData(intent.schemeCodes, intent.category);
    dataBySurface = { [surfaceIds[0]]: data.list, [surfaceIds[1]]: data.insight };
  }

  const dataMessages: A2uiMessage[] = Object.entries(dataBySurface).map(([surfaceId, value]) => ({
    version: "v0.9" as const,
    updateDataModel: { surfaceId, value },
  }));

  return [...structure, ...dataMessages];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agent.test.ts`
Expected: 5 passed.

If `MockLanguageModelV4`'s `doGenerate` result shape doesn't match what `generateObject` expects in the installed `ai` version, inspect `node_modules/ai/dist/test/index.d.ts` and `node_modules/ai/dist/index.d.ts` (search for `generateObject`) for the exact `LanguageModelV4GenerateResult` shape and adjust the mock's `content` array accordingly.

- [ ] **Step 5: Commit**

```bash
git add lib/agent.ts lib/agent.test.ts
git commit -m "feat: add agent orchestration (cache-first structure, always-fresh data)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: `app/api/agent/route.ts`

**Files:**
- Create: `app/api/agent/route.ts`
- Test: `app/api/agent/route.test.ts`

**Interfaces:**
- Consumes: `fetchSchemeList` from `lib/mfapi.ts`; `resolveIntent` from `lib/intent.ts`; `buildA2uiResponse` from `lib/agent.ts`.
- Produces: `POST(request: Request): Promise<Response>` returning `{ messages: A2uiMessage[] }` as JSON.

- [ ] **Step 1: Write the failing tests**

`app/api/agent/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mfapi", () => ({
  fetchSchemeList: vi.fn(),
}));
vi.mock("@/lib/agent", () => ({
  buildA2uiResponse: vi.fn(),
}));

import { fetchSchemeList } from "@/lib/mfapi";
import { buildA2uiResponse } from "@/lib/agent";
import { POST } from "./route";

beforeEach(() => {
  vi.mocked(fetchSchemeList).mockResolvedValue([
    { schemeCode: 1, schemeName: "Example Flexi Cap Fund" },
  ]);
  vi.mocked(buildA2uiResponse).mockResolvedValue([
    { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: "cat:v1" } },
  ] as never);
});

describe("POST /api/agent", () => {
  it("returns 400 when the query is missing", async () => {
    const req = new Request("http://localhost/api/agent", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("resolves intent and returns the built messages for a valid query", async () => {
    const req = new Request("http://localhost/api/agent", {
      method: "POST",
      body: JSON.stringify({ query: "How has the Example Flexi Cap Fund done?" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(buildA2uiResponse).toHaveBeenCalledWith(
      expect.objectContaining({ type: "single_fund", schemeCodes: [1] })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/agent/route.test.ts`
Expected: FAIL — `app/api/agent/route.ts` does not exist.

- [ ] **Step 3: Write the implementation**

`app/api/agent/route.ts`:

```typescript
import { fetchSchemeList } from "@/lib/mfapi";
import { resolveIntent } from "@/lib/intent";
import { buildA2uiResponse } from "@/lib/agent";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const query = body?.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    return Response.json({ error: "Missing required field: query" }, { status: 400 });
  }

  const schemes = await fetchSchemeList();
  const intent = resolveIntent(query, schemes);
  const messages = await buildA2uiResponse(intent);

  return Response.json({ messages });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/agent/route.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/agent/route.ts app/api/agent/route.test.ts
git commit -m "feat: add /api/agent route handler

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: `components/A2UISurface.tsx`

**Files:**
- Create: `components/A2UISurface.tsx`
- Test: `components/A2UISurface.test.tsx`

**Interfaces:**
- Consumes: `appCatalog`, `A2uiMessage` from `lib/catalog.ts`.
- Produces: `A2UISurfaceList: React.FC<{ messages: A2uiMessage[] }>`.

- [ ] **Step 1: Write the failing test**

`components/A2UISurface.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { A2UISurfaceList } from "./A2UISurface";
import { CATALOG_ID, type A2uiMessage } from "@/lib/catalog";

describe("A2UISurfaceList", () => {
  it("renders a StatCard surface driven by createSurface/updateComponents/updateDataModel messages", () => {
    const messages: A2uiMessage[] = [
      { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: CATALOG_ID } },
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "stat",
          components: [
            { component: "StatCard", id: "root", label: "1-Year Return", value: { path: "/statValue" } },
          ],
        },
      },
      { version: "v0.9", updateDataModel: { surfaceId: "stat", value: { statValue: "+18.4%" } } },
    ];

    render(<A2UISurfaceList messages={messages} />);

    expect(screen.getByText("1-Year Return")).toBeInTheDocument();
    expect(screen.getByText("+18.4%")).toBeInTheDocument();
  });

  it("renders nothing when there are no messages", () => {
    const { container } = render(<A2UISurfaceList messages={[]} />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/A2UISurface.test.tsx`
Expected: FAIL — `components/A2UISurface.tsx` does not exist.

- [ ] **Step 3: Write the implementation**

`components/A2UISurface.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageProcessor, type SurfaceModel } from "@a2ui/web_core/v0_9";
import { A2uiSurface, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import { appCatalog, type A2uiMessage } from "@/lib/catalog";

export function A2UISurfaceList({ messages }: { messages: A2uiMessage[] }) {
  const processor = useMemo(() => new MessageProcessor([appCatalog]), []);
  const [surfaces, setSurfaces] = useState<SurfaceModel<ReactComponentImplementation>[]>([]);

  useEffect(() => {
    const createdSub = processor.onSurfaceCreated(() => {
      setSurfaces(Array.from(processor.model.surfacesMap.values()));
    });
    const deletedSub = processor.onSurfaceDeleted(() => {
      setSurfaces(Array.from(processor.model.surfacesMap.values()));
    });
    return () => {
      createdSub.unsubscribe();
      deletedSub.unsubscribe();
    };
  }, [processor]);

  useEffect(() => {
    if (messages.length > 0) {
      processor.processMessages(messages as never);
      setSurfaces(Array.from(processor.model.surfacesMap.values()));
    }
  }, [processor, messages]);

  return (
    <div className="flex flex-col gap-4">
      {surfaces.map((surface) => (
        <A2uiSurface key={surface.id} surface={surface} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/A2UISurface.test.tsx`
Expected: 2 passed.

If `onSurfaceCreated`/`onSurfaceDeleted`'s `Subscription` return type doesn't have an `unsubscribe()` method, check `node_modules/@a2ui/web_core/src/v0_9/common/events.d.ts` for the actual `Subscription` interface and adjust the cleanup calls accordingly.

- [ ] **Step 5: Commit**

```bash
git add components/A2UISurface.tsx components/A2UISurface.test.tsx
git commit -m "feat: add A2UISurfaceList client component driving the real MessageProcessor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: `components/QueryInput.tsx` and `app/page.tsx`

**Files:**
- Create: `components/QueryInput.tsx`
- Modify: `app/page.tsx`
- Test: `components/QueryInput.test.tsx`

**Interfaces:**
- Produces: `QueryInput: React.FC<{ onSubmit: (query: string) => void; disabled?: boolean }>`.
- Consumes (in `app/page.tsx`): `QueryInput`, `A2UISurfaceList` from `components/A2UISurface.tsx`.

- [ ] **Step 1: Write the failing test**

`components/QueryInput.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryInput } from "./QueryInput";

describe("QueryInput", () => {
  it("calls onSubmit with the typed query when the form is submitted", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<QueryInput onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox"), "How has Example Fund done?");
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(onSubmit).toHaveBeenCalledWith("How has Example Fund done?");
  });

  it("does not call onSubmit for an empty query", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<QueryInput onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the button while disabled is true", () => {
    render(<QueryInput onSubmit={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /ask/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/QueryInput.test.tsx`
Expected: FAIL — `components/QueryInput.tsx` does not exist.

- [ ] **Step 3: Write the implementation**

`components/QueryInput.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function QueryInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (query: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. How has the Example Flexi Cap Fund done over 3 years?"
        disabled={disabled}
      />
      <Button type="submit" disabled={disabled}>
        Ask
      </Button>
    </form>
  );
}
```

`app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { QueryInput } from "@/components/QueryInput";
import { A2UISurfaceList } from "@/components/A2UISurface";
import type { A2uiMessage } from "@/lib/catalog";

export default function Home() {
  const [messages, setMessages] = useState<A2uiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(query: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }
      const body = await res.json();
      setMessages(body.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Mutual Fund Dashboard</h1>
      <QueryInput onSubmit={handleSubmit} disabled={loading} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <A2UISurfaceList messages={messages} />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/QueryInput.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: all tests across all files pass.

- [ ] **Step 6: Commit**

```bash
git add components/QueryInput.tsx components/QueryInput.test.tsx app/page.tsx
git commit -m "feat: wire query input and A2UI rendering into the main page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 18: Manual smoke test and README

**Files:**
- Create: `README.md`

**Interfaces:**
- None (this task produces documentation and a manual verification pass, not new interfaces).

- [ ] **Step 1: Set real API credentials**

Copy `.env.example` to `.env.local` and fill in a real `ANTHROPIC_API_KEY` (or set `MODEL_PROVIDER=openai` and `OPENAI_API_KEY`).

- [ ] **Step 2: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 3: Smoke-test the three flagship queries in the browser**

At `http://localhost:3000`, submit each of these and confirm a sensible surface renders with real, non-placeholder NAV-derived numbers:
1. A single-fund query, e.g. "How has \<a real scheme name from `https://api.mfapi.in/mf`\> done?"
2. A comparison query, e.g. "\<fund A\> vs \<fund B\>"
3. A category ranking query, e.g. "Show me the best large cap funds"

- [ ] **Step 4: Confirm the cache actually skips the LLM on repeat intents**

Submit two different single-fund queries in a row (different fund names, same intent type). Add a temporary `console.log` in `lib/agent.ts`'s `fetchStructure` cache-hit branch, confirm it logs on the second call, then remove the `console.log`.

- [ ] **Step 5: Write `README.md`**

```markdown
# A2UI Mutual Fund Dashboard

A Next.js demo applying the A2UI (Agent-to-UI) declarative generative UI
pattern to natural-language analysis of Indian mutual funds.

## Architecture

See [docs/adr/0001-mutual-fund-a2ui-dashboard-architecture.md](docs/adr/0001-mutual-fund-a2ui-dashboard-architecture.md)
for the full architecture decision record, including why the app skips the
AG-UI/CopilotKit runtime, why it uses fixed-schema-per-intent caching, and
why the LLM never sees or emits literal financial figures.

## Setup

```bash
npm install
cp .env.example .env.local  # then fill in ANTHROPIC_API_KEY or OPENAI_API_KEY
npm run dev
```

## Testing

```bash
npm test
```

## Data source

[mfapi.in](https://www.mfapi.in/) — free, unauthenticated, unrated-limited
NAV history and scheme metadata for Indian mutual funds. No holdings,
expense ratio, or AUM data is available, so "analysis" here means
NAV-history-derived metrics (trailing returns, volatility, drawdown), not
portfolio composition.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add README

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Next.js + TypeScript + shadcn/Tailwind app → Task 1.
- `@a2ui/react` as renderer, headless catalog → Tasks 7–12, 16.
- Vercel AI SDK, provider-agnostic → Tasks 13–14.
- Five-component fixed catalog → Tasks 7–11.
- Schema cache keyed on intent + catalog version → Tasks 5, 14.
- mfapi.in data source → Task 2.
- NAV-derived metrics → Task 3.
- Three flagship queries (single fund, compare, category ranking) → Tasks 6, 14, 18.
- No AG-UI/CopilotKit runtime (Option B) → Task 14 calls the Vercel AI SDK directly; no CopilotKit dependency anywhere in the plan.

**Placeholder scan:** No `TBD`/`TODO` remain. The two "if X doesn't match, check file Y" notes (Tasks 12, 14, 16) are explicit, actionable verification steps against real installed package internals — not vague deferrals — included because those three integration points depend on a young (v0.9) third-party protocol library whose exact runtime behavior is safest to confirm against its own bundled source/tests at implementation time, not assumed from documentation alone.

**Type consistency:** `ResolvedIntent`/`IntentType` (Task 6) flow unchanged into `lib/agent.ts` (Task 14) and `app/api/agent/route.ts` (Task 15). `A2uiMessage`/`CATALOG_ID` (Task 12) flow unchanged into `lib/agent.ts`, `A2UISurface.tsx` (Task 16), and `app/page.tsx` (Task 17). `NavPoint` (Task 2) flows unchanged into `lib/metrics.ts` (Task 3) and `lib/agent.ts` (Task 14).
