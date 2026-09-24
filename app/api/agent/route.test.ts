import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mfapi", () => ({
  fetchSchemeList: vi.fn(),
}));
vi.mock("@/lib/agent", () => ({
  buildA2uiResponse: vi.fn(),
}));

import { fetchSchemeList } from "@/lib/mfapi";
import { buildA2uiResponse } from "@/lib/agent";
import { POST } from "./route";

beforeEach(() => {
  vi.mocked(fetchSchemeList).mockResolvedValue([
    { schemeCode: 1, schemeName: "Example Flexi Cap Fund" },
  ]);
  vi.mocked(buildA2uiResponse).mockResolvedValue([
    { version: "v0.9", createSurface: { surfaceId: "stat", catalogId: "cat:v1" } },
  ] as never);
});

describe("POST /api/agent", () => {
  it("returns 400 when the query is missing", async () => {
    const req = new Request("http://localhost/api/agent", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("resolves intent and returns the built messages for a valid query", async () => {
    const req = new Request("http://localhost/api/agent", {
      method: "POST",
      body: JSON.stringify({ query: "How has the Example Flexi Cap Fund done?" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(buildA2uiResponse).toHaveBeenCalledWith(
      expect.objectContaining({ type: "single_fund", schemeCodes: [1] })
    );
  });
});
