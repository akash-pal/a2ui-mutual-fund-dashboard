import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchSchemeList, fetchSchemeNav, clearSchemeListCache } from "./mfapi";

afterEach(() => {
  vi.restoreAllMocks();
  clearSchemeListCache();
});

describe("fetchSchemeList", () => {
  it("fetches and returns the scheme list", async () => {
    const mockData = [
      { schemeCode: 100001, schemeName: "Example Flexi Cap Fund" },
      { schemeCode: 100002, schemeName: "Example Large Cap Fund" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })
    );

    const result = await fetchSchemeList();

    expect(fetch).toHaveBeenCalledWith("https://api.mfapi.in/mf");
    expect(result).toEqual(mockData);
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    await expect(fetchSchemeList()).rejects.toThrow("mfapi.in scheme list request failed: 500");
  });

  it("does not re-fetch on a second call within the cache TTL", async () => {
    const mockData = [{ schemeCode: 1, schemeName: "Example Fund" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockData) })
    );

    await fetchSchemeList();
    const result = await fetchSchemeList();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockData);
  });

  it("re-fetches after the cache is cleared", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ schemeCode: 1, schemeName: "Example Fund" }]),
      })
    );

    await fetchSchemeList();
    clearSchemeListCache();
    await fetchSchemeList();

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("fetchSchemeNav", () => {
  it("fetches and returns NAV history for a scheme", async () => {
    const mockResponse = {
      meta: {
        fund_house: "Example AMC",
        scheme_type: "Open Ended",
        scheme_category: "Flexi Cap Fund",
        scheme_code: 100001,
        scheme_name: "Example Flexi Cap Fund",
      },
      data: [
        { date: "23-09-2026", nav: "142.5000" },
        { date: "22-09-2026", nav: "141.8000" },
      ],
      status: "SUCCESS",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    );

    const result = await fetchSchemeNav(100001);

    expect(fetch).toHaveBeenCalledWith("https://api.mfapi.in/mf/100001");
    expect(result.meta.scheme_name).toBe("Example Flexi Cap Fund");
    expect(result.data).toEqual([
      { date: "23-09-2026", nav: 142.5 },
      { date: "22-09-2026", nav: 141.8 },
    ]);
  });
});
