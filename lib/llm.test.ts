import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getModel", () => {
  it("returns an anthropic model when MODEL_PROVIDER=anthropic", async () => {
    process.env.MODEL_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { getModel } = await import("./llm");
    const model = getModel();
    // @ts-expect-error - LanguageModel type doesn't expose provider, but it exists at runtime
    expect(model.provider).toContain("anthropic");
  });

  it("returns an openai model when MODEL_PROVIDER=openai", async () => {
    process.env.MODEL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const { getModel } = await import("./llm");
    const model = getModel();
    // @ts-expect-error - LanguageModel type doesn't expose provider, but it exists at runtime
    expect(model.provider).toContain("openai");
  });

  it("throws a clear error for an unknown provider", async () => {
    process.env.MODEL_PROVIDER = "not-a-provider";
    const { getModel } = await import("./llm");
    expect(() => getModel()).toThrow(/Unknown MODEL_PROVIDER/);
  });
});
