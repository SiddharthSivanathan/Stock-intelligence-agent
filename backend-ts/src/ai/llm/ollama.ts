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
    // Deterministic defaults tuned for small local models (qwen2.5:3b):
    //  - temperature 0 → reproducible, schema-faithful JSON
    //  - format:"json" → Ollama constrains decoding to valid JSON
    //  - num_ctx 8192  → fit the long analyst prompts without truncation
    //  - repeat_penalty → stop the model looping on list items
    const { data } = await axios.post(
      `${this.baseUrl}/api/chat`,
      {
        model: this.model,
        messages,
        stream: false,
        format: opts.jsonMode ? "json" : undefined,
        keep_alive: "30m",
        options: {
          temperature: opts.temperature ?? 0,
          top_p: 0.9,
          repeat_penalty: 1.1,
          num_ctx: 8192,
          num_predict: opts.maxTokens ?? 4096,
        },
      },
      { timeout: 600_000 },
    );
    return {
      content: data?.message?.content ?? "",
      provider: this.name,
      model: this.model,
      usage: {
        prompt_tokens: data?.prompt_eval_count,
        completion_tokens: data?.eval_count,
        total_tokens:
          (data?.prompt_eval_count ?? 0) + (data?.eval_count ?? 0) || undefined,
      },
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
