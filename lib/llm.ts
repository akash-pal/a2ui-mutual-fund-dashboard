import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export function getModel(): LanguageModel {
  const provider = process.env.MODEL_PROVIDER ?? "anthropic";
  switch (provider) {
    case "anthropic":
      return anthropic("claude-sonnet-5");
    case "openai":
      return openai("gpt-5");
    default:
      throw new Error(`Unknown MODEL_PROVIDER: "${provider}". Expected "anthropic" or "openai".`);
  }
}
