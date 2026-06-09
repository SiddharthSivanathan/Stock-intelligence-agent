/**
 * Provider singleton selection based on LLM_PROVIDER env var.
 *
 * Lazy: first call constructs; subsequent calls reuse.
 */
import type { LLMProvider } from "./types.js";
import { config } from "../../config.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

let cached: LLMProvider | null = null;

export function getLLM(): LLMProvider {
  if (cached) return cached;
  switch (config.LLM_PROVIDER) {
    case "gemini":
      cached = new GeminiProvider();
      break;
    case "openai":
      cached = new OpenAIProvider();
      break;
    case "ollama":
      cached = new OllamaProvider();
      break;
  }
  return cached!;
}
