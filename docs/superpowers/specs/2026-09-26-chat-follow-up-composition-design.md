# Chat & Follow-Up Composition — Design Spec

**Status:** Approved (design), pending implementation plan
**Date:** 2026-09-26
**Amends:** [ADR-0001](../../adr/0001-mutual-fund-a2ui-dashboard-architecture.md)

## Context

The app today is single-shot: type a question, get one dashboard, ask again and
the previous dashboard is entirely replaced. There is no way to ask a follow-up
question about the fund you were just looking at — "what about its 3-year
return?" or "compare it to fund Y" require re-naming the fund from scratch, and
even then each answer discards the last.

The goal: let a user find a fund, then keep asking about it (or bring in a second
fund to compare) in a natural back-and-forth, with the conversation visible as a
transcript.

### Amendment to ADR-0001

ADR-0001's Context section states: *"The point is to exercise declarative
generative UI, not chat... A plain chatbot that prints numbers would miss the
point of the exercise."* This spec deliberately supersedes that specific point.
The rest of ADR-0001 (fixed five-component catalog, dynamic composition within
it, schema cache keyed on intent, LLM never emits literal figures) is unchanged
and still governs how each individual answer is built — only the *presentation*
becomes conversational, and a new, narrowly-scoped LLM responsibility (resolving
what a follow-up refers to) is added on top of the existing deterministic
pipeline. This is worth recording explicitly rather than silently drifting from
a decision the ADR states as intentional.

## Decision

Add a chat transcript UI. Each turn is either:
- a user question (plain text), or
- an assistant turn, which is either a rendered A2UI dashboard (the existing
  single_fund/compare_funds/category_ranking output) or a plain-text reply (for
  questions the app's data can't answer).

A new LLM step resolves what a follow-up question refers to by **rewriting it
into a self-contained query**, then hands off to the **existing, unchanged**
deterministic pipeline (`resolveIntent` → `buildA2uiResponse`). The existing
pipeline has no awareness that a rewrite happened — from its point of view every
request still looks like a fresh, fully-specified question.

```
User turn: "What about its 3-year return?"
              │
              ▼
   ┌─────────────────────────┐
   │ resolveFollowUp (LLM)    │  sees: conversation history + new message
   │ → rewritten query, OR    │  "What is the 3-year return of UTI Nifty 50
   │ → plain text answer      │   Index Fund?"
   └─────────────────────────┘
              │ (rewritten query only)
              ▼
   resolveIntent (existing, unchanged, no-LLM)
              │
              ▼
   buildA2uiResponse (existing, unchanged)
              │
              ▼
   New dashboard turn appended to the transcript
```

### Why this approach, not the alternatives

| Approach | Assessment |
|---|---|
| **Query rewriting (chosen)** | Existing deterministic pipeline is untouched — same cache keys, same validation, same tests. New LLM responsibility is narrow and independently testable: given history + a message, produce one self-contained query or a text answer. |
| LLM directly outputs intent + scheme codes | Would need the LLM to search the ~75k-scheme list itself (tool/function calling), since it can't fit in a prompt. A materially bigger build for this iteration, and duplicates matching logic `lib/intent.ts` already does well. |
| Deterministic "remember last fund" (no LLM) | Already ruled out in favor of this approach: can't handle combining a remembered fund with a newly-named one ("compare it to fund Y"), and can't tell an answerable follow-up from an unanswerable one (needs judgment, not string matching). |

## Detailed Design

### Follow-up resolution (`lib/followup.ts`, new)

```typescript
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface FollowUpResolution {
  type: "query" | "text_answer";
  text: string;
}

export async function resolveFollowUp(
  history: ConversationTurn[],
  message: string
): Promise<FollowUpResolution>;
```

- Uses `generateObject` (existing `getModel()` from `lib/llm.ts`, no new provider
  wiring) against a **flat object schema** `{ type: "query" | "text_answer",
  text: string }`, not a discriminated union: OpenAI structured-output mode
  requires the root schema to be an object, and a union compiles to a root-level
  `anyOf` that OpenAI rejects. Both fields required, no `.optional()` (same
  constraint already handled in `lib/catalog-messages.ts`). Plain `zod` (v4) is
  fine here — the `zod3` alias is only needed for schemas that embed
  `@a2ui/web_core`'s own zod3 types, which this one doesn't.
- If `history` is empty (first message of a session), skip the LLM call entirely
  and return `{ type: "query", text: message }` — no behavior change for a
  fresh session, and no added latency/cost for the common single-question case.
- Prompt instructs: rewrite the message into one that names every fund
  explicitly and states the specific data being asked for, **copying fund names
  exactly as they appear in the conversation** (`resolveIntent` matches by
  substring against real scheme names, so a paraphrased name won't resolve);
  if the question asks for something this app's data cannot answer (anything
  other than NAV-derived trailing returns, comparison, or category ranking —
  e.g. expense ratio, holdings, AUM), return a `text_answer` explaining that
  plainly instead of guessing. The prompt also forbids stating any figure in a
  `text_answer`.
- **Figure guard on `text_answer`.** The prompt alone can't guarantee a free-text
  reply won't invent a number ("its expense ratio is 0.8%"), which would be a
  fabricated financial figure presented as fact. `resolveFollowUp` checks the
  text deterministically — a percentage (`\d+(\.\d+)?\s*%`) or a rupee amount
  (`₹` or `Rs.` followed by a digit) — and if either appears, replaces the reply
  with a fixed message saying the app can only report NAV-based returns,
  comparisons, and category rankings. Fund names containing digits
  ("Nifty 50") don't trip it, since neither pattern matches them.
- **Length guard on the rewrite.** A `query` result longer than the route's
  existing `MAX_QUERY_LENGTH` (500) is treated as a failed rewrite (the route's
  existing 500-path handles the throw), so the rewrite can't bypass the bound
  the route already places on what reaches `resolveIntent`.
- The rewritten query still goes through the full existing `resolveIntent`
  substring-matching pipeline — if the rewrite doesn't actually name a real
  fund clearly enough for that to resolve, the existing "couldn't find a
  matching fund" 400 response fires exactly as it does today. No new failure
  mode is introduced at that boundary.

### History content stays number-free

An assistant turn's `content` (what the NEXT request sends back as `history`)
must not contain the figures shown on screen. The insight text for a dashboard
says things like "returned -5.3% over the trailing 1 year"; replaying that to
the rewrite LLM would mean it sees literal financial figures, which is the one
thing ADR-0001 says it never does. So a dashboard turn's history content is a
number-free summary naming the intent and the exact fund names, e.g.
*"Showed a single-fund dashboard for: UTI Nifty 50 Index Fund - Direct Plan -
Growth"*. A text-answer turn's content is its text (already guarded above).

The client can't build this summary itself — the response only carries A2UI
messages, not the resolved intent or scheme names. The route has both in scope
(`intent` and the loaded `schemes` list), so it builds the summary and returns
it (`lib/turn-summary.ts`, new, pure function, unit-tested on its own).

### Route handler (`app/api/agent/route.ts`, modified)

- Request body gains an optional `history: ConversationTurn[]` field (empty/
  absent for a fresh session). **`history` is untrusted input and is validated
  server-side** with zod before use: an array of at most 10 entries, each
  `{ role: "user" | "assistant", content: string }` with content at most 500
  characters (the same bound as the query itself). Anything else is a 400.
  `MAX_REQUEST_BODY_BYTES` rises from 10KB to 20KB: a maximal valid request
  (10 × 500-char entries plus a 500-char query) is ~6KB of ASCII but up to ~17KB
  if every character is multi-byte, so 10KB would reject some valid requests.
- New flow: `resolveFollowUp(history, query)` → branch:
  - `text_answer`: return `{ type: "text_answer", text }` directly, skipping
    `resolveIntent`/`buildA2uiResponse` entirely.
  - `query`: proceed with `resolveIntent(rewrittenText, schemes)` →
    `buildA2uiResponse(intent)` exactly as today, wrapped in the existing
    try/catch. The existing query-length guard still applies to the *original*
    `query` field, before any of this runs.
- Response shape gains a discriminant so the client knows which kind of turn
  it got back: `{ type: "dashboard", messages: A2uiMessage[], summary: string } | { type: "text_answer", text: string }`.

### Single-fund insight covers 3Y/5Y (`lib/insights.ts`, modified)

The spec's own headline example — "what about its 3-year return?" — would
otherwise not work: it rewrites to a single-fund query, and the single-fund
dashboard only shows the 1-year return (both the StatCard's label and the
insight text). The user would get the same dashboard back with no answer.
`generateSingleFundInsight` already receives the full `TrailingReturns`
(1M/3M/1Y/3Y/5Y); it's extended to also state the 3-year and 5-year returns
when they're available. Deterministic, no prompt or schema change, and the
3Y/5Y figures come from the same `computeTrailingReturns` the rest of the app
already trusts.

### Client (`app/page.tsx`, `components/ChatTranscript.tsx` new)

- Replaces the current single-dashboard layout with a scrolling list of turns.
- The user's turn appears immediately on send, followed by a pending indicator
  until the response arrives. The input clears on send.
- Each assistant dashboard turn gets its own `<ErrorBoundary>` keyed by turn id
  — a crash rendering one turn's dashboard must not take down the rest of the
  transcript. (Today a single boundary wraps the one visible result, remounted
  on every question via a `queryCount` key; that key goes away.)
- A failed request becomes an error turn in the transcript (showing the route's
  `error` message) rather than a banner above the input. A failed attempt —
  the error turn *and* the question that produced it — is **excluded from
  `history`**: it isn't context the rewrite needs, and a dangling question with
  no answer would only confuse it.
- Client sends history with each request (no server-side session store —
  consistent with the app's existing stateless-per-request design documented in
  ADR-0001's Consequences: no auth, no multi-tenancy, single user, in-memory-only
  state), trimmed to the last 10 entries and with each entry's content truncated
  to 500 characters before sending. The truncation matters: a long `text_answer`
  from the LLM would otherwise exceed the server's per-entry limit, and every
  later question in the conversation would then fail validation.
- The user turn's history content is the text the user actually typed (not the
  rewritten query). The assistant turn's is the route's `summary` (dashboard) or
  `text` (text answer).

### ADR-0001 (modified)

Add an "Amended by" line pointing at this spec, so a reader of the ADR alone
isn't misled by its "not chat" statement.

### Testing

- `lib/followup.test.ts`: empty history → returns the message unchanged without
  calling the LLM; rewrite reusing a remembered single fund; rewrite combining
  a remembered fund with a newly-named one for a comparison; `text_answer` for a
  question outside the app's data; figure guard replaces a `text_answer`
  containing a percentage or rupee amount, and does *not* trip on a fund name
  like "Nifty 50"; over-length rewrite throws — each against a mocked LLM
  response, matching this codebase's existing `MockLanguageModelV4` pattern.
- `lib/turn-summary.test.ts`: summaries for each intent type contain the exact
  scheme names and no digits-followed-by-`%`.
- `lib/insights.test.ts`: single-fund insight states 3Y/5Y when available and
  omits them cleanly when null.
- `app/api/agent/route.test.ts`: `text_answer` result skips
  `resolveIntent`/`buildA2uiResponse` entirely; `query` result flows the
  *rewritten* text into `resolveIntent`; dashboard response includes `type` and
  `summary`; malformed or oversized `history` → 400; existing no-history tests
  keep passing (only the response shape assertion changes, to expect
  `type: "dashboard"`).
- `components/ChatTranscript.test.tsx` (new): renders user, dashboard, text, and
  error turns; a crash in one dashboard turn leaves the other turns in the DOM.

## Consequences

- **Easier:** a user can explore one fund (or a small set of funds) across
  several questions without re-stating context each time.
- **Harder:** every follow-up message now costs one extra LLM round-trip
  (the rewrite step) before the existing pipeline even starts — added latency
  and cost on every message after the first, not just cache-miss ones. Worth
  monitoring if this app's LLM usage patterns matter later; out of scope to
  optimize now (e.g. batching, or skipping the rewrite when the message looks
  self-contained already).
- **Harder:** conversation state lives only in the browser tab (matching the
  app's existing no-persistence design) — a page refresh loses the
  conversation. Consistent with "personal demo, not a product" from ADR-0001;
  would need a real session store to change.
- **Revisit later:** if follow-ups turn out to need more than the existing 3
  intent types can express (e.g. "show me its expense ratio next to its
  return" once/if a second data source is ever added per ADR-0001's own
  "Harder" note), the query-rewriting approach's ceiling is the existing
  pipeline's ceiling — a real architecture change, not a tweak, would be
  needed at that point.
