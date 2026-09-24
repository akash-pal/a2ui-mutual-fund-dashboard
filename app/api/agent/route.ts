import { fetchSchemeList } from "@/lib/mfapi";
import { resolveIntent } from "@/lib/intent";
import { buildA2uiResponse } from "@/lib/agent";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const query = body?.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    return Response.json({ error: "Missing required field: query" }, { status: 400 });
  }

  const schemes = await fetchSchemeList();
  const intent = resolveIntent(query, schemes);
  const messages = await buildA2uiResponse(intent);

  return Response.json({ messages });
}
