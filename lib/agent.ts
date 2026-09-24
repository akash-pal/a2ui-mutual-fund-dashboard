import { generateObject, type FlexibleSchema } from "ai";
import { z } from "zod3";
import { getModel } from "./llm";
import { fetchSchemeNav } from "./mfapi";
import { computeTrailingReturns } from "./metrics";
import {
  generateSingleFundInsight,
  generateComparisonInsight,
  generateRankingInsight,
} from "./insights";
import { buildCacheKey, getCachedSchema, setCachedSchema } from "./cache";
import { A2uiMessageSchema, CATALOG_ID, type A2uiMessage } from "./catalog-messages";
import type { ResolvedIntent } from "./intent";

// A category ranking can fetch NAV history for dozens of candidate schemes (see
// MAX_CATEGORY_CANDIDATES in lib/intent.ts) -- show only the top results, not
// every candidate that was fetched to determine them.
const MAX_RANKING_RESULTS = 10;

const StructureResponseSchema = z.object({
  messages: z.array(A2uiMessageSchema).min(1),
});

// Named separately (see the `generateObject` call below) so the schema's static type can be
// pinned to this instead of letting TypeScript re-derive it from the zod3 schema each time.
type StructureResponse = { messages: A2uiMessage[] };

const STRUCTURE_PROMPTS: Record<ResolvedIntent["type"], string> = {
  single_fund: `Produce A2UI v0.9 "messages" for a page with THREE surfaces, in this order:
1. surfaceId "stat": one createSurface + one updateComponents whose single root component is "StatCard", with label as a short literal string (e.g. "1-Year Return") and value bound to {"path":"/statValue"} and trend bound to {"path":"/statTrend"}.
2. surfaceId "chart": one createSurface + one updateComponents whose single root component is "NavChart", with title as a literal string and points bound to {"path":"/navPoints"}.
3. surfaceId "insight": one createSurface + one updateComponents whose single root component is "InsightCallout", with text bound to {"path":"/insightText"}.
Every component's "id" must be "root". catalogId must be "${CATALOG_ID}" for every createSurface. Do not include any updateDataModel messages or literal numeric values.`,
  compare_funds: `Produce A2UI v0.9 "messages" for a page with TWO surfaces, in this order:
1. surfaceId "table": one createSurface + one updateComponents whose single root component is "ComparisonTable", with title as a literal string, columns bound to {"path":"/columns"}, and rows bound to {"path":"/rows"}.
2. surfaceId "insight": one createSurface + one updateComponents whose single root component is "InsightCallout", with text bound to {"path":"/insightText"}.
Every component's "id" must be "root". catalogId must be "${CATALOG_ID}" for every createSurface. Do not include any updateDataModel messages or literal numeric values.`,
  category_ranking: `Produce A2UI v0.9 "messages" for a page with TWO surfaces, in this order:
1. surfaceId "list": one createSurface + one updateComponents whose single root component is "RankedList", with title as a literal string and items bound to {"path":"/items"}.
2. surfaceId "insight": one createSurface + one updateComponents whose single root component is "InsightCallout", with text bound to {"path":"/insightText"}.
Every component's "id" must be "root". catalogId must be "${CATALOG_ID}" for every createSurface. Do not include any updateDataModel messages or literal numeric values.`,
};

const EXPECTED_SURFACE_IDS: Record<ResolvedIntent["type"], string[]> = {
  single_fund: ["stat", "chart", "insight"],
  compare_funds: ["table", "insight"],
  category_ranking: ["list", "insight"],
};

async function fetchStructure(intentType: ResolvedIntent["type"]): Promise<A2uiMessage[]> {
  const cacheKey = buildCacheKey(intentType);
  const cached = getCachedSchema<A2uiMessage[]>(cacheKey);
  if (cached) return cached;

  const { object } = await generateObject({
    model: getModel(),
    // `@ai-sdk/provider-utils`'s FlexibleSchema/InferSchema conditional types check the schema
    // against ITS OWN bundled `zod/v3` compat types (see `import * as z3 from 'zod/v3'` in
    // node_modules/@ai-sdk/provider-utils/dist/index.d.ts), not against this project's separately
    // aliased `zod3` package (npm:zod@3.25.76 under lib/catalog.ts's A2uiMessageSchema). The two
    // are structurally near-identical but nominally distinct deeply-recursive class hierarchies,
    // and TypeScript's structural check between them exceeds its instantiation-depth limit
    // ("Type instantiation is excessively deep and possibly infinite") even for a trivial zod3
    // schema (verified with a one-field z.object() in isolation). At runtime this is a non-issue:
    // zod 3.25.76 implements the Standard Schema `~standard` interface, which `generateObject`
    // detects and validates against correctly regardless of which physical zod package built the
    // schema (confirmed by this file's passing tests). This cast only changes what TypeScript
    // believes the static type is; the real zod3 object and its `~standard` validator are
    // untouched, so runtime schema validation is unaffected.
    schema: StructureResponseSchema as unknown as FlexibleSchema<StructureResponse>,
    prompt: STRUCTURE_PROMPTS[intentType],
  });

  const generatedSurfaceIds = new Set(surfaceIdsInOrder(object.messages));
  const missing = EXPECTED_SURFACE_IDS[intentType].filter((id) => !generatedSurfaceIds.has(id));
  if (missing.length > 0) {
    throw new Error(
      `LLM-generated structure for intent "${intentType}" is missing expected surface(s): ${missing.join(", ")}`
    );
  }

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
    table: { columns: ["Fund", "1Y Return", "3Y Return"], rows },
    insight: { insightText: insight },
  };
}

async function buildCategoryRankingData(schemeCodes: number[], category: string | undefined) {
  // allSettled, not all -- a category ranking fetches dozens of schemes at once (see
  // MAX_CATEGORY_CANDIDATES), and one bad/slow fetch among them shouldn't fail the
  // whole ranking when the rest succeeded.
  const results = await Promise.allSettled(schemeCodes.map((code) => fetchSchemeNav(code)));
  const navs = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchSchemeNav>>> => r.status === "fulfilled")
    .map((r) => r.value);
  const ranked = navs
    .map((nav) => ({
      name: nav.meta.scheme_name,
      oneYearReturn: computeTrailingReturns(nav.data)["1Y"],
    }))
    .sort((a, b) => (b.oneYearReturn ?? -Infinity) - (a.oneYearReturn ?? -Infinity))
    .slice(0, MAX_RANKING_RESULTS);
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

  let dataBySurface: Record<string, Record<string, unknown>>;
  if (intent.type === "single_fund") {
    const data = await buildSingleFundData(intent.schemeCodes);
    dataBySurface = { stat: data.stat, chart: data.chart, insight: data.insight };
  } else if (intent.type === "compare_funds") {
    const data = await buildCompareFundsData(intent.schemeCodes);
    dataBySurface = { table: data.table, insight: data.insight };
  } else {
    const data = await buildCategoryRankingData(intent.schemeCodes, intent.category);
    dataBySurface = { list: data.list, insight: data.insight };
  }

  const dataMessages: A2uiMessage[] = Object.entries(dataBySurface).map(([surfaceId, value]) => ({
    version: "v0.9" as const,
    updateDataModel: { surfaceId, value },
  }));

  return [...structure, ...dataMessages];
}
