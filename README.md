# A2UI Mutual Fund Dashboard

A Next.js demo applying the A2UI (Agent-to-UI) declarative generative UI
pattern to natural-language analysis of Indian mutual funds.

![Demo: typing a natural-language question about a real mutual fund and getting back a generated dashboard with its 1-year return, a NAV history chart, and a plain-language summary.](docs/images/demo.gif)

## Architecture

See [docs/adr/0001-mutual-fund-a2ui-dashboard-architecture.md](docs/adr/0001-mutual-fund-a2ui-dashboard-architecture.md)
for the full architecture decision record, including why the app skips the
AG-UI/CopilotKit runtime, why it uses fixed-schema-per-intent caching, and
why the LLM never sees or emits literal financial figures.

![End-to-end request flow: a query resolves intent deterministically, reuses or regenerates a UI structure from an LLM behind a cache, always refetches fresh NAV data, and renders the result through the fixed A2UI component catalog.](docs/images/end-to-end-flow.svg)

The LLM is only ever asked to produce *structure* (which of the five catalog
components to show and how they're bound to data paths) — never to see or
emit a literal NAV figure or return percentage. Those are always computed
deterministically from fresh `mfapi.in` data and merged in afterward, whether
the structure came from a fresh LLM call or the cache.

### What each step does

| Step | Package | Responsibility |
|---|---|---|
| `QueryInput` | this app | Collects the natural-language question and POSTs it to `/api/agent`. |
| `resolveIntent()` | this app (`lib/intent.ts`) | Deterministic, no LLM involved. Classifies the query as a single-fund lookup, a comparison, or a category ranking, and matches fund names against the live `mfapi.in` scheme list. |
| cache lookup | this app (`lib/cache.ts`) | Keyed on intent type + catalog version. A hit skips the LLM entirely; a miss falls through to `generateObject()`. |
| `generateObject()` | `ai` (Vercel AI SDK) → Anthropic/OpenAI | Only on a cache miss. Asked to produce *just the layout*: which catalog components go on which surfaces and which data-model paths they bind to — never asked for, and structurally unable to emit, a literal number (see the sample response below). |
| `validateStructure()` | this app (`lib/agent.ts`) | Checks the LLM's output against what the rest of the app actually needs before it's ever cached: the right component in the right surface, bound to the exact path the data step below will write to, with a real `createSurface` (in the right order) for every surface it references. A structure that fails this is never cached and never reaches the client. |
| `fetchSchemeNav()` | this app (`lib/mfapi.ts`) | Always runs, on every request regardless of cache hit/miss. Fetches that fund's real NAV history from `mfapi.in`, from which `lib/metrics.ts` computes real trailing returns. |
| `buildA2uiResponse()` | this app (`lib/agent.ts`) | Merges the (cached or fresh) structure with the freshly computed data into the final list of A2UI messages sent to the client. |
| `MessageProcessor` | `@a2ui/web_core` | Runs client-side. Processes the incoming messages into a live surface/data model, resolving each `{"path": "..."}` binding against the real values. |
| `A2uiSurface` | `@a2ui/react` | Runs client-side. Renders the resolved model through this app's five registered catalog components (`StatCard`, `NavChart`, `ComparisonTable`, `RankedList`, `InsightCallout`). |

### Sample LLM response

This is a real `generateObject()` output, captured live for "Compare HDFC
Flexi Cap Fund vs UTI Nifty 50 Index Fund Direct Growth" — exactly what the
LLM produced, unedited. Notice there isn't a single number in it:

```json
{
  "messages": [
    { "version": "v0.9", "createSurface": { "surfaceId": "table", "catalogId": "a2ui-mutual-fund-dashboard.local:v1" } },
    {
      "version": "v0.9",
      "updateComponents": {
        "surfaceId": "table",
        "components": [
          {
            "component": "ComparisonTable",
            "id": "root",
            "title": "Comparison Table",
            "columns": { "path": "/columns" },
            "rows": { "path": "/rows" }
          }
        ]
      }
    },
    { "version": "v0.9", "createSurface": { "surfaceId": "insight", "catalogId": "a2ui-mutual-fund-dashboard.local:v1" } },
    {
      "version": "v0.9",
      "updateComponents": {
        "surfaceId": "insight",
        "components": [
          { "component": "InsightCallout", "id": "root", "text": { "path": "/insightText" } }
        ]
      }
    }
  ]
}
```

`buildA2uiResponse()` then appends the part the LLM never sees or touches —
real numbers, computed fresh from `mfapi.in`, filled into the exact paths
above:

```json
{
  "version": "v0.9",
  "updateDataModel": {
    "surfaceId": "table",
    "value": {
      "columns": ["Fund", "1Y Return", "3Y Return"],
      "rows": [
        ["HDFC Flexi Cap Fund - Direct Plan - Growth Option", "0.7%", "53.9%"],
        ["UTI Nifty 50 Index Fund - Direct Plan - Growth", "-5.3%", "20.8%"]
      ]
    }
  }
}
```

## Setup

```bash
npm install
cp .env.example .env.local  # then fill in ANTHROPIC_API_KEY or OPENAI_API_KEY
npm run dev
```

If your shell already exports `ANTHROPIC_BASE_URL`/`OPENAI_BASE_URL` for a
local LLM workflow (e.g. Ollama), unset them before running `npm run dev`,
or they will silently redirect this app's API calls to your local server
instead of the real Anthropic/OpenAI API. `.env.local` cannot override an
already-exported shell variable of the same name.

## Testing

```bash
npm test
```

## Data source

[mfapi.in](https://www.mfapi.in/) — free, unauthenticated, unrated-limited
NAV history and scheme metadata for Indian mutual funds. No holdings,
expense ratio, or AUM data is available, so "analysis" here means
NAV-history-derived metrics, not portfolio composition. The app currently
surfaces trailing returns (1M/3M/1Y/3Y/5Y); `lib/metrics.ts` also implements
CAGR, annualized volatility, and max drawdown (tested, but not yet wired
into any catalog component).

Real scheme names always carry both a plan qualifier (Direct/Regular Plan)
and an option qualifier (Growth/IDCW/Dividend Option) — e.g. "HDFC Flexi
Cap Fund - Direct Plan - Growth Option". Naming just the fund in a query
resolves to the Direct + Growth variant by default, since that's the
combination "how has this fund done" conventionally refers to.
