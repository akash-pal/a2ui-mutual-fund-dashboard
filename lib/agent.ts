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
import {
  StructureMessageSchema,
  CATALOG_ID,
  type A2uiMessage,
  type StructureMessage,
} from "./catalog-messages";
import type { ResolvedIntent } from "./intent";

// A category ranking can fetch NAV history for dozens of candidate schemes (see
// MAX_CATEGORY_CANDIDATES in lib/intent.ts) -- show only the top results, not
// every candidate that was fetched to determine them.
const MAX_RANKING_RESULTS = 10;

const StructureResponseSchema = z.object({
  messages: z.array(StructureMessageSchema).min(1),
});

// Named separately (see the `generateObject` call below) so the schema's static type can be
// pinned to this instead of letting TypeScript re-derive it from the zod3 schema each time.
type StructureResponse = { messages: StructureMessage[] };

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

// The exact contract each intent type's data-population code relies on: which
// component must sit at each surface's root, and which of its props must be bound
// to which data-model path (matching the `updateDataModel` values buildA2uiResponse
// sends below). Checking only that a surface with the right ID exists (the original,
// weaker check) let a structure through that named the right surface but put the
// wrong component in it, or bound a prop to the wrong path -- either would silently
// show nothing/the wrong thing at render time instead of failing loudly here, where
// a bad result can still be rejected before it's cached.
type SurfaceContract = { component: string; paths: Record<string, string> };
const EXPECTED_STRUCTURE: Record<ResolvedIntent["type"], Record<string, SurfaceContract>> = {
  single_fund: {
    stat: { component: "StatCard", paths: { value: "/statValue", trend: "/statTrend" } },
    chart: { component: "NavChart", paths: { points: "/navPoints" } },
    insight: { component: "InsightCallout", paths: { text: "/insightText" } },
  },
  compare_funds: {
    table: { component: "ComparisonTable", paths: { columns: "/columns", rows: "/rows" } },
    insight: { component: "InsightCallout", paths: { text: "/insightText" } },
  },
  category_ranking: {
    list: { component: "RankedList", paths: { items: "/items" } },
    insight: { component: "InsightCallout", paths: { text: "/insightText" } },
  },
};

function findRootComponent(
  messages: A2uiMessage[],
  surfaceId: string
): Record<string, unknown> | undefined {
  for (const m of messages) {
    if ("updateComponents" in m && m.updateComponents.surfaceId === surfaceId) {
      return m.updateComponents.components.find((c) => c.id === "root") as
        | Record<string, unknown>
        | undefined;
    }
  }
  return undefined;
}

function findSurfaceCreation(
  messages: A2uiMessage[],
  surfaceId: string
): { surfaceId: string; catalogId: string } | undefined {
  for (const m of messages) {
    if ("createSurface" in m && m.createSurface.surfaceId === surfaceId) {
      return m.createSurface;
    }
  }
  return undefined;
}

function validateStructure(intentType: ResolvedIntent["type"], messages: A2uiMessage[]): void {
  for (const [surfaceId, contract] of Object.entries(EXPECTED_STRUCTURE[intentType])) {
    // A structure whose updateComponents is otherwise perfect but never creates the
    // surface is still worthless: MessageProcessor throws "Surface not found" the
    // moment it processes that updateComponents message (confirmed directly against
    // node_modules/@a2ui/web_core/src/v0_9/processing/message-processor.js:263-266)
    // -- reproduced live against a real local model that omitted every createSurface
    // message while still passing every other check here.
    const surfaceCreation = findSurfaceCreation(messages, surfaceId);
    if (!surfaceCreation) {
      throw new Error(
        `LLM-generated structure for intent "${intentType}" is missing expected surface: ${surfaceId} (no createSurface message)`
      );
    }
    if (surfaceCreation.catalogId !== CATALOG_ID) {
      throw new Error(
        `LLM-generated structure for intent "${intentType}" surface "${surfaceId}" createSurface has catalogId ` +
          `"${surfaceCreation.catalogId}", expected "${CATALOG_ID}"`
      );
    }

    const root = findRootComponent(messages, surfaceId);
    if (!root) {
      throw new Error(
        `LLM-generated structure for intent "${intentType}" is missing expected surface: ${surfaceId}`
      );
    }
    // Existence alone isn't enough -- MessageProcessor processes messages strictly in
    // array order, so createSurface must come BEFORE its surface's updateComponents,
    // not just appear somewhere in the array.
    const creationIndex = messages.findIndex(
      (m) => "createSurface" in m && m.createSurface.surfaceId === surfaceId
    );
    const rootUpdateIndex = messages.findIndex(
      (m) => "updateComponents" in m && m.updateComponents.surfaceId === surfaceId
    );
    if (rootUpdateIndex < creationIndex) {
      throw new Error(
        `LLM-generated structure for intent "${intentType}" surface "${surfaceId}" has updateComponents ` +
          `before its createSurface message`
      );
    }
    if (root.component !== contract.component) {
      throw new Error(
        `LLM-generated structure for intent "${intentType}" surface "${surfaceId}" has component ` +
          `"${String(root.component)}", expected "${contract.component}"`
      );
    }
    for (const [propName, expectedPath] of Object.entries(contract.paths)) {
      const actualPath = (root[propName] as { path?: string } | undefined)?.path;
      if (actualPath !== expectedPath) {
        throw new Error(
          `LLM-generated structure for intent "${intentType}" surface "${surfaceId}" binds ` +
            `"${propName}" to "${actualPath ?? "(missing)"}", expected "${expectedPath}"`
        );
      }
    }
  }
}

async function fetchStructure(intentType: ResolvedIntent["type"]): Promise<A2uiMessage[]> {
  const cacheKey = buildCacheKey(intentType);
  const cached = getCachedSchema<A2uiMessage[]>(cacheKey);
  if (cached) {
    console.log(`[agent] fetchStructure(${intentType}): cache hit (${cacheKey})`);
    return cached;
  }

  console.log(`[agent] fetchStructure(${intentType}): cache miss (${cacheKey}), calling LLM...`);
  const startedAt = Date.now();
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

  console.log(`[agent] fetchStructure(${intentType}): LLM responded in ${Date.now() - startedAt}ms`);
  validateStructure(intentType, object.messages);

  setCachedSchema(cacheKey, object.messages);
  return object.messages;
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
