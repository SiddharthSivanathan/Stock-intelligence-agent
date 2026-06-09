/**
 * Ollama provider — talks to a local Ollama server's /api/chat endpoint.
 *
 * No SDK; we just hit the HTTP API to keep the install footprint small.
 */
import axios from "axios";
import type { ChatMessage, ChatOptions, ChatResponse, LLMProvider } from "./types.js";
import { config } from "../../config.js";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly model: string;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.OLLAMA_BASE_URL.replace(/\/$/, "");
    this.model = config.OLLAMA_MODEL;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResponse> {
    const { data } = await axios.post(
      `${this.baseUrl}/api/chat`,
      {
        model: this.model,
        messages,
        stream: false,
        format: opts.jsonMode ? "json" : undefined,
        options: {
          temperature: opts.temperature,
          num_predict: opts.maxTokens,
        },
      },
      { timeout: 600_000 },
    );
    return {
      content: data?.message?.content ?? "",
      provider: this.name,
      model: this.model,
    };
  }

  async *stream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncIterable<string> {
    const response = await axios.post(
      `${this.baseUrl}/api/chat`,
      {
        model: this.model,
        messages,
        stream: true,
        options: {
          temperature: opts.temperature,
          num_predict: opts.maxTokens,
        },
      },
      { responseType: "stream", timeout: 600_000 },
    );
    let buf = "";
    for await (const chunk of response.data as AsyncIterable<Buffer>) {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj?.message?.content) yield obj.message.content as string;
          if (obj?.done) return;
        } catch {
          /* ignore non-JSON keepalive lines */
        }
      }
    }
  }
}
