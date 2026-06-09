/**
 * Google Gemini provider (default).
 *
 * Uses @google/generative-ai. Gemini doesn't have a first-class "system" role,
 * so we fold system messages into the systemInstruction field.
 */
import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import type { ChatMessage, ChatOptions, ChatResponse, LLMProvider } from "./types.js";
import { config } from "../../config.js";

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
    const result = await chat.sendMessage(last?.parts ?? [{ text: "" }]);
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
