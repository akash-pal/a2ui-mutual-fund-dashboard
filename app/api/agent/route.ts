import { fetchSchemeList } from "@/lib/mfapi";
import { resolveIntent } from "@/lib/intent";
import { buildA2uiResponse } from "@/lib/agent";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const query = body?.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    return Response.json({ error: "Missing required field: query" }, { status: 400 });
  }

  try {
    const schemes = await fetchSchemeList();
    const intent = resolveIntent(query, schemes);

    if (intent.schemeCodes.length === 0) {
      return Response.json(
        { error: "Couldn't find a mutual fund matching your query. Try naming the fund more specifically." },
        { status: 400 }
      );
    }

    const messages = await buildA2uiResponse(intent);

    return Response.json({ messages });
  } catch (error) {
    // Without this, an unexpected failure (mfapi.in down, the LLM provider
    // unreachable, a validation error) falls through to Next.js's own default error
    // response, which has no `error` JSON field -- the client's fallback ("Request
    // failed: <status>") is far less useful than the specific messages this route
    // already returns for its other two failure cases.
    console.error("POST /api/agent failed:", error);
    return Response.json(
      { error: "Something went wrong processing your request. Please try again." },
      { status: 500 }
    );
  }
}
