# Changelog

Plain-language log of what's been built, in the order it happened. See
`docs/adr/0001-mutual-fund-a2ui-dashboard-architecture.md` for why, and
`docs/superpowers/plans/2026-09-24-a2ui-mutual-fund-dashboard.md` for the
full implementation plan this is executing.

## In progress

- Task 16 (client-side A2UI surface renderer) is starting now.

## Up next (in order)

16. Client-side A2UI surface renderer
17. Query input + main page wiring
18. Manual smoke test + README

## Done

1. **Project scaffold** — Next.js 16 + TypeScript + App Router, Tailwind CSS v4, shadcn/ui
   (button/input/card/table), Vitest + React Testing Library. `npm run dev`, `npm test`,
   `npm run build`, and `npm run lint` all pass clean. One toolchain note: this Next.js/Tailwind
   version configures Tailwind via `app/globals.css` (`@theme`) rather than a separate
   `tailwind.config.ts` file — that's current Tailwind v4 behavior, not a gap.
2. **`mfapi.in` client** (`lib/mfapi.ts`) — typed functions to fetch the full mutual fund
   scheme list and a given scheme's NAV history from the free, no-auth mfapi.in API. 3/3
   tests passing, reviewed clean.
3. **NAV-derived metrics** (`lib/metrics.ts`) — trailing returns (1M/3M/1Y/3Y/5Y), CAGR,
   annualized volatility, and max drawdown. Review caught a real date-arithmetic bug (month-end
   and leap-year dates could pick the wrong reference NAV point); fixed and covered by
   regression tests verified to actually fail without the fix. 10/10 tests passing.
4. **Deterministic insight text** (`lib/insights.ts`) — templated, no-LLM commentary for a
   single fund, a fund comparison, and a category ranking. 4/4 tests passing, reviewed clean.
5. **Schema cache** (`lib/cache.ts`) — in-memory cache keyed on intent type + catalog version,
   so the agent-composed UI structure can be reused instead of regenerated on every request.
   6/6 tests passing, reviewed clean.
6. **Intent resolution** (`lib/intent.ts`) — deterministic (no-LLM) classification of a query
   into single-fund lookup, fund comparison, or category ranking. Review caught 4 real bugs
   around how the real mfapi.in data (which lists every fund twice, as Direct and Regular Plan
   entries) could produce ambiguous or self-duplicated results; all fixed and covered by
   verified-discriminating regression tests. 9/9 tests passing.
7. **`StatCard` catalog component** (`components/catalog/StatCard.tsx`) — the first UI component
   wired to the real A2UI protocol. Found and fixed a real dependency conflict: this project's
   zod (needed for the AI SDK) and the zod bundled inside the A2UI packages are incompatible
   major versions. Added an aliased zod3 dependency as the fix and pre-emptively applied the
   same fix to the plan for the four remaining catalog components, so they won't hit the same
   issue. 3/3 component tests passing, full suite 36/36, reviewed clean.
8. **`NavChart` catalog component** (`components/catalog/NavChart.tsx`) — a Recharts line chart
   for NAV history. Review caught a missing runtime guard against non-array bound data before
   handing it to Recharts; fixed here and pre-emptively in the plan for the two remaining table/
   list components. 2/2 tests passing, reviewed clean.
9. **`ComparisonTable` catalog component** (`components/catalog/ComparisonTable.tsx`) — a shadcn
   table for comparing multiple funds side by side. 3/3 tests passing, reviewed clean.
10. **`RankedList` catalog component** (`components/catalog/RankedList.tsx`) — an ordered list for
    category-ranking results. 2/2 tests passing, reviewed clean.
11. **`InsightCallout` catalog component** (`components/catalog/InsightCallout.tsx`) — a styled
    callout for deterministic insight commentary. This completes all five catalog components.
    2/2 tests passing, reviewed clean.
12. **Wired the real A2UI catalog + message schema** (`lib/catalog.ts`) — the five components are
    now registered in a real `Catalog` instance, with a Zod schema validating messages against the
    actual A2UI v0.9 protocol. Review caught two places where the schema was stricter/looser than
    the real spec (data-model update values, required component IDs); fixed and covered by tests.
    10/10 tests passing, full suite 55/55.
13. **Provider-agnostic model selection** (`lib/llm.ts`) — picks Anthropic or OpenAI via an env
    var, for the Vercel AI SDK. 3/3 tests passing, reviewed clean.
14. **Agent orchestration** (`lib/agent.ts`) — the core of the app: resolves an intent into a
    cache-first LLM call for UI structure, plus always-fresh NAV data and deterministic insight
    text computed on every request regardless of cache hit/miss. Review caught a real fragility
    (data could land on the wrong UI surface if the LLM's output order varied, and a bad result
    would get cached permanently); fixed by matching surfaces by name instead of position, with a
    validation check before anything is cached. Test coverage extended to all three query types.
    8/8 tests passing, full suite 66/66.
15. **`/api/agent` route handler** (`app/api/agent/route.ts`) — the HTTP entry point that ties the
    query, intent resolution, and orchestration together. This surfaced a real, critical bug:
    `npm run build` failed for this route because the catalog's UI components and their data
    schemas were defined together in the same files, and importing the schemas (needed by
    server-only code) pulled in React component code that isn't allowed to run in that context.
    Fixed by splitting each catalog component's schema out into its own file, separate from its
    UI code — this required touching the five already-completed catalog components, but keeps
    everything else about them unchanged. Full suite 68/68, production build verified working.
