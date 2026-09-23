# Changelog

Plain-language log of what's been built, in the order it happened. See
`docs/adr/0001-mutual-fund-a2ui-dashboard-architecture.md` for why, and
`docs/superpowers/plans/2026-09-24-a2ui-mutual-fund-dashboard.md` for the
full implementation plan this is executing.

## In progress

- Task 7 (`StatCard` catalog component) is starting now.

## Up next (in order)

7. `StatCard` catalog component
8. `NavChart` catalog component
9. `ComparisonTable` catalog component
10. `RankedList` catalog component
11. `InsightCallout` catalog component
12. Wire the five components into the real A2UI catalog + message schema
13. Provider-agnostic model selection (Anthropic/OpenAI via env var)
14. Agent orchestration (cache-first structure, always-fresh data)
15. `/api/agent` route handler
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
