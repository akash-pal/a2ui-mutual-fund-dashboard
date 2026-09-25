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
          {
            component: "StatCard",
            id: "root",
            label: "1-Year Return",
            value: { path: "/statValue" },
            trend: { path: "/statTrend" },
          },
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
            columns: { path: "/columns" },
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
    const tableValue = tableData?.updateDataModel.value as { columns: unknown; rows: unknown[] };
    expect(Array.isArray(tableValue.rows)).toBe(true);
    // The server (not the LLM) supplies columns, so their count always matches
    // each row's cell count -- guards against the columns/rows mismatch the
    // original literal-array prompt could produce.
    expect(tableValue.columns).toEqual(["Fund", "1Y Return", "3Y Return"]);
    expect(tableValue.rows.every((row) => Array.isArray(row) && row.length === (tableValue.columns as unknown[]).length)).toBe(true);
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

  it("does not fail the whole category ranking when one scheme's NAV fetch fails", async () => {
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
    const today = new Date();
    vi.mocked(fetchSchemeNav).mockImplementation(async (code: number) => {
      if (code === 2) throw new Error("network error");
      return {
        meta: {
          fund_house: "Example AMC",
          scheme_type: "Open Ended",
          scheme_category: "Large Cap Fund",
          scheme_code: code,
          scheme_name: `Fund ${code}`,
        },
        data: [{ date: formatDate(today), nav: 100 + code }],
      };
    });

    const messages = await buildA2uiResponse({
      type: "category_ranking",
      schemeCodes: [1, 2, 3],
      category: "large cap",
    });
    const dataMessages = messages.filter(
      (m): m is Extract<typeof m, { updateDataModel: unknown }> => "updateDataModel" in m
    );
    const listData = dataMessages.find((m) => m.updateDataModel.surfaceId === "list");
    const items = (listData?.updateDataModel.value as { items: Array<{ name: string }> }).items;
    // Scheme 2's fetch rejected -- the ranking still returns the other two, not an error.
    expect(items.map((i) => i.name).sort()).toEqual(["Fund 1", "Fund 3"]);
  });

  it("limits the ranked category list to the top results even when many candidates were fetched", async () => {
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
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    vi.mocked(fetchSchemeNav).mockImplementation(async (code: number) => ({
      meta: {
        fund_house: "Example AMC",
        scheme_type: "Open Ended",
        scheme_category: "Large Cap Fund",
        scheme_code: code,
        scheme_name: `Fund ${code}`,
      },
      // Distinct, increasing 1Y returns per code so ranking order is unambiguous.
      data: [
        { date: formatDate(today), nav: 100 + code },
        { date: formatDate(oneYearAgo), nav: 100 },
      ],
    }));
    const schemeCodes = Array.from({ length: 15 }, (_, i) => i + 1);

    const messages = await buildA2uiResponse({
      type: "category_ranking",
      schemeCodes,
      category: "large cap",
    });
    const dataMessages = messages.filter(
      (m): m is Extract<typeof m, { updateDataModel: unknown }> => "updateDataModel" in m
    );
    const listData = dataMessages.find((m) => m.updateDataModel.surfaceId === "list");
    const items = (listData?.updateDataModel.value as { items: Array<{ name: string }> }).items;
    expect(items.length).toBe(10);
    // Highest 1Y return (code 15) must lead, confirming this is a top-N slice of the
    // sorted ranking, not just the first 10 scheme codes in input order.
    expect(items[0].name).toBe("Fund 15");
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
                        {
                          component: "StatCard",
                          id: "root",
                          label: "x",
                          value: { path: "/statValue" },
                          trend: { path: "/statTrend" },
                        },
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

  it("throws when updateComponents defines a surface's root correctly but createSurface for it is missing", async () => {
    // Regression: reproduced live against a real local model (Ollama) that produced
    // an otherwise-perfect structure -- right components, right paths -- but omitted
    // every createSurface message. That passed every check that only inspects
    // updateComponents, then crashed at render time: MessageProcessor throws
    // "Surface not found" the moment it processes an updateComponents message for a
    // surface that was never created (node_modules/@a2ui/web_core/src/v0_9/
    // processing/message-processor.js:263-266) -- and since it validated fine, it
    // would have been cached and broken every subsequent single_fund query.
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
                  // No createSurface for "stat" at all -- everything else is valid.
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "stat",
                      components: [
                        {
                          component: "StatCard",
                          id: "root",
                          label: "x",
                          value: { path: "/statValue" },
                          trend: { path: "/statTrend" },
                        },
                      ],
                    },
                  },
                  { version: "v0.9", createSurface: { surfaceId: "chart", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "chart",
                      components: [{ component: "NavChart", id: "root", title: "x", points: { path: "/navPoints" } }],
                    },
                  },
                  { version: "v0.9", createSurface: { surfaceId: "insight", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "insight",
                      components: [{ component: "InsightCallout", id: "root", text: { path: "/insightText" } }],
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
      /missing expected surface: stat \(no createSurface message\)/
    );
  });

  it("throws when createSurface's catalogId doesn't match this app's catalog", async () => {
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
                  { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: "some-other-catalog:v1" } },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "stat",
                      components: [
                        {
                          component: "StatCard",
                          id: "root",
                          label: "x",
                          value: { path: "/statValue" },
                          trend: { path: "/statTrend" },
                        },
                      ],
                    },
                  },
                  { version: "v0.9", createSurface: { surfaceId: "chart", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "chart",
                      components: [{ component: "NavChart", id: "root", title: "x", points: { path: "/navPoints" } }],
                    },
                  },
                  { version: "v0.9", createSurface: { surfaceId: "insight", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "insight",
                      components: [{ component: "InsightCallout", id: "root", text: { path: "/insightText" } }],
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
      /createSurface has catalogId "some-other-catalog:v1", expected/
    );
  });

  it("throws when a surface's root component doesn't match the expected type, even though the surface ID is right", async () => {
    // Regression for the weaker check this replaced: it only confirmed a surface
    // with the right ID existed, not that the RIGHT component was in it -- this
    // structure names the "chart" surface correctly but puts an InsightCallout
    // (not NavChart) in its root, which would previously have passed validation
    // and gotten cached, then silently rendered the wrong component forever.
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
                  { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "stat",
                      components: [
                        {
                          component: "StatCard",
                          id: "root",
                          label: "x",
                          value: { path: "/statValue" },
                          trend: { path: "/statTrend" },
                        },
                      ],
                    },
                  },
                  { version: "v0.9", createSurface: { surfaceId: "chart", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "chart",
                      components: [{ component: "InsightCallout", id: "root", text: { path: "/insightText" } }],
                    },
                  },
                  { version: "v0.9", createSurface: { surfaceId: "insight", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "insight",
                      components: [{ component: "InsightCallout", id: "root", text: { path: "/insightText" } }],
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
      /surface "chart" has component "InsightCallout", expected "NavChart"/
    );
  });

  it("throws when a required prop is bound to the wrong data-model path", async () => {
    // Regression: the old check never looked at WHERE a prop was bound, only that
    // the surface existed with the right component. A structure that bound
    // ComparisonTable's "rows" to the wrong path would validate, get cached, and
    // then never populate -- buildA2uiResponse's updateDataModel writes to "/rows",
    // not whatever the LLM happened to pick.
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
                          columns: { path: "/columns" },
                          rows: { path: "/tableRows" },
                        },
                      ],
                    },
                  },
                  { version: "v0.9", createSurface: { surfaceId: "insight", catalogId: "a2ui-mutual-fund-dashboard.local:v1" } },
                  {
                    version: "v0.9",
                    updateComponents: {
                      surfaceId: "insight",
                      components: [{ component: "InsightCallout", id: "root", text: { path: "/insightText" } }],
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
    await expect(
      buildA2uiResponse({ type: "compare_funds", schemeCodes: [1, 2] })
    ).rejects.toThrow(/surface "table" binds "rows" to "\/tableRows", expected "\/rows"/);
  });
});
