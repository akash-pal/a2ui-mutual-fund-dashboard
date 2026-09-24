# Changelog

Plain-language log of what's been built, in the order it happened. See
`docs/adr/0001-mutual-fund-a2ui-dashboard-architecture.md` for why, and
`docs/superpowers/plans/2026-09-24-a2ui-mutual-fund-dashboard.md` for the
full implementation plan this is executing.

## In progress

All 18 planned tasks are complete, and every finding from the final whole-branch
review has been addressed, including one significant bug (see below) found only by
testing live against the real APIs. What's left is a final closing pass over the
whole branch before this is ready to merge.

## Final review findings

The final review (a broader pass across everything, looking for problems that only
show up when pieces are combined) found the most serious bug in the whole project:
**every single query crashed or silently rendered empty**, regardless of which LLM
provider was used. Four of the five UI components were built with the wrong kind of
data-binding declaration — one that the underlying rendering library silently never
resolves — so they received a raw internal reference instead of the actual value.
`InsightCallout` crashed outright; `NavChart`, `ComparisonTable`, and `RankedList`
quietly showed nothing. No test caught this because every earlier test checked the
data shape in isolation, never a real render through the full pipeline. Fixed, with
new tests that render through the real pipeline for all four components — each
checked to genuinely fail without the fix before being accepted.

(Correction to Task 18's note below: the render crash seen during that task's live
smoke test was assumed at the time to be a quirk of the weak local model substituted
after the API credit ran out. It wasn't — it was this exact bug, provider-independent,
confirmed by reading the rendering library's own source. Recorded here so the record
stays accurate.)

Also fixed:
- Mutual funds that haven't been updated in a while were showing a misleading "0%
  return" instead of "not available," because the calculation was comparing the same
  stale data point to itself.
- Added a client-side error boundary around the rendered dashboard, so a malformed
  or unexpected response can no longer take down the whole page with a blank screen —
  it now shows a plain "something went wrong, try again" message instead, and a fresh
  question always gets a clean slate rather than staying stuck on a past error.
- The fund-comparison table's column headers were written independently from its
  rows by the LLM prompt, so a header-count/row-width mismatch was possible. Columns
  are now supplied by the app itself alongside the rows, so they can never drift apart.
- A single-fund question could resolve to the wrong fund, or to no fund at all, when
  the real fund list happened to also contain one of two oddly-named entries that
  are literally just the words "Growth" or "Dividend" with no fund name attached
  (confirmed these exist in the live mfapi.in data). Fixed by using the same
  "best, most specific match wins" logic already used for comparison queries, and
  by ignoring those two bare entries as possible matches entirely.

- The "best funds" (category ranking) query type didn't hold up against the full
  real-world fund list: a popular category like "large cap" matches over 400 real
  schemes, which would have meant fetching data for all of them at once (confirmed
  against the live fund list); one bad fetch among them would have failed the whole
  request; and some duplicate listings of the same fund (ones where the source data
  omits a space before the plan/option name) could slip past the de-duplication.
  Fixed by capping how many candidate funds are looked up per query, tolerating one
  or two of them failing to load without failing the whole request, showing only the
  top 10 results, and fixing the de-duplication gap.

- The app caches the AI's generated page layout per question type, to avoid asking
  it to redesign the same page on every request. The check for whether a generated
  layout was good enough to cache was too weak — it only confirmed the right
  sections existed on the page, not that they held the right kind of content or
  were wired up to the right data. A bad layout could have passed that check,
  gotten cached, and then quietly shown the wrong thing (or nothing) on every
  question of that type until the app restarted. Fixed by checking the exact
  content and data wiring the app actually needs, not just that a section exists.

- Live-tested against the real OpenAI API for the first time (the app supports
  switching between Anthropic and OpenAI, but OpenAI had never actually been tried
  end to end until now) and found it was completely broken: OpenAI enforces a
  stricter rule than Anthropic about what a valid response format looks like, and
  our schema didn't follow it, so every OpenAI request failed outright. Fixed by
  tightening the schema to meet that stricter rule (and, in doing so, also fixing a
  small existing prompt/schema mismatch that was flagged but not yet acted on).
  Confirmed fixed against the real OpenAI API, not just automated tests.

- Cleaned up several smaller findings from the same review: a generic browser error
  page could show instead of a helpful message when something unexpected failed
  server-side (confirmed and fixed after seeing it happen live during today's
  testing); the full mutual fund list (tens of thousands of entries) was being
  re-downloaded from the data source on every single question instead of being
  reused for an hour; an unused library dependency was removed; the browser tab
  title still said the default "Create Next App" (also seen live today); a
  documentation claim about which metrics the app analyzes was corrected to match
  what's actually shown; and two basic request-size safeguards were added (a
  sensible limit on how long a question can be, and on how large the request
  itself can be) as routine hardening.

All planned work and every finding from the final review are now addressed. What's
left before this is ready to merge is a final closing pass over the whole branch.

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
16. **Client-side A2UI surface renderer** (`components/A2UISurface.tsx`) — drives the real
    `MessageProcessor` and renders the resulting surfaces. Tracing a review's "worth watching
    later" note into the next task's actual page code turned up a guaranteed crash: the renderer
    reused one processor for the whole session, but every new question reuses the same surface
    names, so asking a second question would have thrown immediately. Fixed by giving each new
    question's answer its own processor. 3/3 tests passing, full suite unaffected.
17. **Query input + main page wiring** (`components/QueryInput.tsx`, `app/page.tsx`) — the app is
    now usable end to end: type a question, get a dashboard back. This is the last functional
    task; everything from here is testing and documentation. Full suite 74/74, reviewed clean.
18. **Live smoke test + README** — ran the app for real, with a real Anthropic API key, against
    real fund data. This caught the most impactful bugs found in the whole project, because
    they only show up with real data: real fund names always include a "Growth" or "IDCW" tag
    that the matching logic didn't know to ignore, so an ordinary question about a real fund
    matched nothing and crashed the app; a "best funds" list could show the same fund up to 4
    times; and a related edge case (a fund whose own name happens to contain the word "Growth")
    was caught and fixed during review before being called done. All fixed and verified against
    live data, not just test fixtures. Full suite 78/78. One thing intentionally left open: a
    render error seen only while using a local stand-in model (after the API key ran out of
    credit mid-test) that needs re-checking against the real API once credit is available.
