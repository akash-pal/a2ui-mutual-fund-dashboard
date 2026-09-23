# Changelog

Plain-language log of what's been built, in the order it happened. See
`docs/adr/0001-mutual-fund-a2ui-dashboard-architecture.md` for why, and
`docs/superpowers/plans/2026-09-24-a2ui-mutual-fund-dashboard.md` for the
full implementation plan this is executing.

## In progress

- Task 2 (`mfapi.in` client) is starting now.

## Up next (in order)

2. `mfapi.in` client (scheme list + NAV history)
3. NAV-derived metrics (trailing returns, CAGR, volatility, drawdown)
4. Deterministic insight text (no LLM — templated commentary)
5. Schema cache (reuse agent-composed structure across requests)
6. Intent resolution (single fund / compare funds / category ranking — no LLM)
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
