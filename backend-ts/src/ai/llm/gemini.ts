/**
 * Google Gemini provider (default).
 *
 * Uses @google/generative-ai. Gemini doesn't have a first-class "system" role,
 * so we fold system messages into the systemInstruction field.
 */
import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import type { ChatMessage, ChatOptions, ChatResponse, LLMProvider } from "./types.js";
import { config } from "../../config.js";

/**
 * Retry a Gemini call on transient 429 (free-tier rate limits). The free tier
 * caps requests-per-minute, and the multi-agent workflow fans out several calls
 * at once, so short bursts can trip the limit. We honour the server's suggested
 * retry delay when present, otherwise back off exponentially, capped so a single
 * analysis never hangs too long.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = (e as Error).message ?? "";
      const isRateLimit = /\b429\b|Too Many Requests|quota/i.test(msg);
      // A *daily* quota (RequestsPerDay / "per day") won't clear within a request
      // lifetime — retrying just burns ~40s per call, so fail fast instead.
      const isDailyCap = /per\s*day|PerDay|RequestsPerDay/i.test(msg);
      if (!isRateLimit || isDailyCap || i === attempts - 1) throw e;
      // Prefer the server's "retry in Xs" hint; cap at 20s so the UI isn't stuck.
      const hinted = Number(msg.match(/retry in ([\d.]+)s/i)?.[1]);
      const waitMs = Math.min(
        Number.isFinite(hinted) ? hinted * 1000 + 500 : (i + 1) * 2500,
        20_000,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

function split(messages: ChatMessage[]): { system: string; history: Content[] } {
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const history: Content[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  return { system: sys, history };
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly model: string;
  private client: GoogleGenerativeAI;

  constructor() {
    if (!config.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for gemini provider");
    this.client = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    this.model = config.GEMINI_MODEL;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResponse> {
    const { system, history } = split(messages);
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: system || undefined,
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
        responseMimeType: opts.jsonMode ? "application/json" : undefined,
      },
    });
    // Last user message is the prompt; everything before is conversation history.
    const last = history[history.length - 1];
    const prior = history.slice(0, -1);
    const chat = model.startChat({ history: prior });
    const result = await withRetry(() => chat.sendMessage(last?.parts ?? [{ text: "" }]));
    const response = result.response;
    return {
      content: response.text(),
      provider: this.name,
      model: this.model,
      usage: {
        prompt_tokens: response.usageMetadata?.promptTokenCount,
        completion_tokens: response.usageMetadata?.candidatesTokenCount,
        total_tokens: response.usageMetadata?.totalTokenCount,
      },
    };
  }

  async *stream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncIterable<string> {
    const { system, history } = split(messages);
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: system || undefined,
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
      },
    });
    const last = history[history.length - 1];
    const prior = history.slice(0, -1);
    const chat = model.startChat({ history: prior });
    const result = await chat.sendMessageStream(last?.parts ?? [{ text: "" }]);
    for await (const chunk of result.stream) {
      const txt = chunk.text();
      if (txt) yield txt;
    }
  }
}
