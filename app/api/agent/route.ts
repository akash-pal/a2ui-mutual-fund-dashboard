import { fetchSchemeList } from "@/lib/mfapi";
import { resolveIntent } from "@/lib/intent";
import { buildA2uiResponse } from "@/lib/agent";

// No real query about a specific fund needs anywhere near this many characters.
// The raw query text is never sent to an LLM (intent resolution is fully
// deterministic -- see lib/intent.ts), but resolveIntent does run substring checks
// against the full ~75k-entry scheme list for every query, so this bounds that work
// and rejects obviously-pathological input early.
const MAX_QUERY_LENGTH = 500;

// Unlike Server Actions, an App Router Route Handler has no default request body
// size limit -- request.json() will attempt to buffer and parse the entire body
// before any of this route's own checks can run. A real request here is a tiny
// JSON object with one short string field, so reject anything wildly larger up
// front based on Content-Length, before ever calling request.json(). This only
// catches a client that reports its size honestly (a normal browser fetch() call
// does) -- it's not a defense against a client that sends a large body while lying
// about or omitting the header; that requires a streaming byte-counting read, or
// relying on the hosting platform's own request size limit.
const MAX_REQUEST_BODY_BYTES = 10_000;

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return Response.json({ error: "Request body is too large." }, { status: 413 });
  }

  const body = await request.json().catch(() => null);
  const query = body?.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    return Response.json({ error: "Missing required field: query" }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json(
      { error: `Query is too long (max ${MAX_QUERY_LENGTH} characters).` },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  console.log(`[route] POST /api/agent: query=${JSON.stringify(query)}`);
  try {
    const schemes = await fetchSchemeList();
    const intent = resolveIntent(query, schemes);
    console.log(`[route] resolved intent: ${intent.type}, schemeCodes=${JSON.stringify(intent.schemeCodes)}`);

    if (intent.schemeCodes.length === 0) {
      return Response.json(
        { error: "Couldn't find a mutual fund matching your query. Try naming the fund more specifically." },
        { status: 400 }
      );
    }

    const messages = await buildA2uiResponse(intent);
    console.log(`[route] done in ${Date.now() - startedAt}ms, ${messages.length} messages`);

    return Response.json({ messages });
  } catch (error) {
    // Without this, an unexpected failure (mfapi.in down, the LLM provider
    // unreachable, a validation error) falls through to Next.js's own default error
    // response, which has no `error` JSON field -- the client's fallback ("Request
    // failed: <status>") is far less useful than the specific messages this route
    // already returns for its other two failure cases.
    console.error(`[route] failed after ${Date.now() - startedAt}ms:`, error);
    return Response.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
