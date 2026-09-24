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

// Surfaces listed in the OPPOSITE order from what their prompt requests, deliberately — this is
// the regression fixture for the name-based (not positional) surface-to-data mapping fix.
const COMPARE_FUNDS_STRUCTURE = {
  messages: [
    { version: "v0.9", createSurface: { surfaceId: "insight", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "insight",
        components: [{ component: "InsightCallout", id: "root", text: { path: "/insightText" } }],
      },
    },
    { version: "v0.9", createSurface: { surfaceId: "table", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "table",
        components: [
          {
            component: "ComparisonTable",
            id: "root",
            title: "Fund Comparison",
            columns: ["Fund", "1Y Return", "3Y Return"],
            rows: { path: "/rows" },
          },
        ],
      },
    },
  ],
};

const CATEGORY_RANKING_STRUCTURE = {
  messages: [
    { version: "v0.9", createSurface: { surfaceId: "insight", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "insight",
        components: [{ component: "InsightCallout", id: "root", text: { path: "/insightText" } }],
      },
    },
    { version: "v0.9", createSurface: { surfaceId: "list", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "list",
        components: [
          { component: "RankedList", id: "root", title: "Top Large Cap Funds", items: { path: "/items" } },
        ],
      },
    },
  ],
};

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

beforeEach(() => {
  // Without this, `fetchSchemeNav`/`getModel` call counts accumulate across tests in this
  // file (vitest's `clearMocks` defaults to false and isn't set in vitest.config.mts), which
  // makes call-count assertions in later tests fail depending on what earlier tests did.
  vi.clearAllMocks();
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
        // The installed @ai-sdk/provider's LanguageModelV4GenerateResult shapes finishReason and
        // usage as nested objects (not flat primitives) — see node_modules/@ai-sdk/provider/dist/index.d.ts.
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        content: [{ type: "text", text: JSON.stringify(SINGLE_FUND_STRUCTURE) }],
        warnings: [],
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

  it("assigns compare_funds data to the correct surfaces regardless of the LLM's message order", async () => {
    vi.mocked(getModel).mockReturnValue(
      new MockLanguageModelV4({
        doGenerate: {
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
          content: [{ type: "text", text: JSON.stringify(COMPARE_FUNDS_STRUCTURE) }],
          warnings: [],
        },
      }) as never
    );
    const messages = await buildA2uiResponse({ type: "compare_funds", schemeCodes: [1, 2] });
    const dataMessages = messages.filter(
      (m): m is Extract<typeof m, { updateDataModel: unknown }> => "updateDataModel" in m
    );
    const tableData = dataMessages.find((m) => m.updateDataModel.surfaceId === "table");
    const insightData = dataMessages.find((m) => m.updateDataModel.surfaceId === "insight");
    expect(Array.isArray((tableData?.updateDataModel.value as { rows: unknown }).rows)).toBe(true);
    expect(typeof (insightData?.updateDataModel.value as { insightText: unknown }).insightText).toBe("string");
  });

  it("assigns category_ranking data to the correct surfaces regardless of the LLM's message order", async () => {
    vi.mocked(getModel).mockReturnValue(
      new MockLanguageModelV4({
        doGenerate: {
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
          content: [{ type: "text", text: JSON.stringify(CATEGORY_RANKING_STRUCTURE) }],
          warnings: [],
        },
      }) as never
    );
    const messages = await buildA2uiResponse({
      type: "category_ranking",
      schemeCodes: [1, 2],
      category: "large cap",
    });
    const dataMessages = messages.filter(
      (m): m is Extract<typeof m, { updateDataModel: unknown }> => "updateDataModel" in m
    );
    const listData = dataMessages.find((m) => m.updateDataModel.surfaceId === "list");
    const insightData = dataMessages.find((m) => m.updateDataModel.surfaceId === "insight");
    expect(Array.isArray((listData?.updateDataModel.value as { items: unknown }).items)).toBe(true);
    expect(typeof (insightData?.updateDataModel.value as { insightText: unknown }).insightText).toBe("string");
  });

  it("throws a clear error when the LLM-generated structure is missing an expected surface", async () => {
    vi.mocked(getModel).mockReturnValue(
      new MockLanguageModelV4({
        doGenerate: {
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
          content: [
            {
              type: "text",
              text: JSON.stringify({
                messages: [
                  {
                    version: "v0.9",
                    createSurface: { surfaceId: "stat", catalogId: "a2ui-mutual-fund-dashboard.local:v1" },
                  },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "stat",
                      components: [
                        { component: "StatCard", id: "root", label: "x", value: { path: "/statValue" } },
                      ],
                    },
                  },
                ],
              }),
            },
          ],
          warnings: [],
        },
      }) as never
    );
    await expect(buildA2uiResponse({ type: "single_fund", schemeCodes: [1] })).rejects.toThrow(
      /missing expected surface/
    );
  });
});
