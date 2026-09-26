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
export type FollowUpResolution =
  | { type: "query"; text: string }
  | { type: "text_answer"; text: string };

export interface ConversationTurn {
  role: "user" | "assistant";
  // For an assistant turn that produced a dashboard, record enough to give the
  // LLM real context without replaying the full A2UI message array (which can
  // be large and isn't meaningful to it as prose): the resolved intent type and
  // a plain-language description of what was shown.
  content: string;
}

export async function resolveFollowUp(
  history: ConversationTurn[],
  message: string
): Promise<FollowUpResolution>;
```

- Uses `generateObject` (existing `getModel()` from `lib/llm.ts`, no new provider
  wiring) against a small schema: a discriminated union of the two branches
  above. Same OpenAI-structured-output constraints already handled elsewhere in
  this codebase apply (every field required, no `.optional()`).
- If `history` is empty (first message of a session), skip the LLM call entirely
  and treat the message as already self-contained — no behavior change for a
  fresh session, and no added latency/cost for the common single-question case.
- Prompt instructs: rewrite the message into one that names every fund
  explicitly and states the specific data being asked for, using the
  conversation history to fill in anything the new message leaves implicit; if
  the question asks for something this app's data cannot answer (anything
  other than NAV-derived trailing returns, comparison, or category ranking —
  e.g. expense ratio, holdings, AUM), return a `text_answer` explaining that
  plainly instead of guessing.
- The rewritten query still goes through the full existing `resolveIntent`
  substring-matching pipeline — if the rewrite doesn't actually name a real
  fund clearly enough for that to resolve, the existing "couldn't find a
  matching fund" 400 response fires exactly as it does today. No new failure
  mode is introduced at that boundary.

### Route handler (`app/api/agent/route.ts`, modified)

- Request body gains an optional `history: ConversationTurn[]` field (empty/
  absent for a fresh session).
- New flow: `resolveFollowUp(history, query)` → branch:
  - `text_answer`: return `{ type: "text_answer", text }` directly, skipping
    `resolveIntent`/`buildA2uiResponse` entirely.
  - `query`: proceed with `resolveIntent(rewrittenText, schemes)` →
    `buildA2uiResponse(intent)` exactly as today, wrapped in the existing
    try/catch, existing query-length guard applied to the *original* `query`
    field (the rewrite happens server-side, after that guard, so it still
    bounds what the client can send as the new message).
- The existing `MAX_REQUEST_BODY_BYTES` (10KB) cap now covers `history` too, not
  just `query` — a real multi-turn conversation's turn summaries could plausibly
  approach that over a long session. Client keeps `history` bounded to the last
  N turns (N to be picked during implementation, e.g. 10) before sending, both
  to stay under that cap and because a rewrite prompt doesn't need unbounded
  history to resolve "what does 'it' refer to" — only recent context matters for
  that. `MAX_REQUEST_BODY_BYTES` itself does not need to change.
- Response shape gains a discriminant so the client knows which kind of turn
  it got back: `{ type: "dashboard", messages: A2uiMessage[] } | { type: "text_answer", text: string }`.

### Client (`app/page.tsx`, `components/ChatTranscript.tsx` new)

- Replaces the current single-dashboard layout with a scrolling list of turns.
- Each turn keeps its own `<ErrorBoundary>` (this app already has one per
  Finding #3 from the earlier review) — a crash rendering one historical turn's
  dashboard must not take down the rest of the transcript, whereas today a
  fresh `key` remounts the *entire* result on every question.
- Client sends the full turn history with each request (no server-side session
  store — consistent with the app's existing stateless-per-request design
  documented in ADR-0001's Consequences: no auth, no multi-tenancy, single
  user, in-memory-only state).
- A turn's `content` summary (used for the NEXT request's `history`) is built
  client-side from the response: for a dashboard turn, a short plain-language
  description (fund name(s) + intent type — not the full A2UI message array);
  for a text-answer turn, the text itself.

### Testing

- `lib/followup.test.ts`: empty history → treated as self-contained (no LLM
  call); rewrite reusing a remembered single fund; rewrite combining a
  remembered fund with a newly-named one for a comparison; falls back to
  `text_answer` for a question outside the app's data (e.g. expense ratio) —
  each verified against a mocked LLM response, matching this codebase's
  existing `MockLanguageModelV4` test pattern.
- `app/api/agent/route.test.ts`: new tests for both branches (history present +
  `text_answer` result skips `resolveIntent`/`buildA2uiResponse` entirely;
  history present + `query` result flows into the existing pipeline
  unchanged); existing tests (empty/no history) continue to pass unmodified,
  since empty history means no behavior change.
- `components/ChatTranscript.test.tsx` (new) / updates to
  `components/A2UISurface.test.tsx`: each turn renders independently and a
  crash in one turn's dashboard doesn't remove other turns from the DOM.

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
