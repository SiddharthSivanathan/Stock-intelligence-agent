/**
 * OpenAI provider (or any OpenAI-API-compatible endpoint like Groq).
 */
import OpenAI from "openai";
import type { ChatMessage, ChatOptions, ChatResponse, LLMProvider } from "./types.js";
import { config } from "../../config.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly model: string;
  private client: OpenAI;

  constructor() {
    if (!config.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for openai provider");
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.model = config.OPENAI_MODEL;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResponse> {
    const resp = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      response_format: opts.jsonMode ? { type: "json_object" } : undefined,
    });
    const choice = resp.choices[0];
    return {
      content: choice?.message?.content ?? "",
      provider: this.name,
      model: this.model,
      usage: resp.usage
        ? {
            prompt_tokens: resp.usage.prompt_tokens,
            completion_tokens: resp.usage.completion_tokens,
            total_tokens: resp.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *stream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
