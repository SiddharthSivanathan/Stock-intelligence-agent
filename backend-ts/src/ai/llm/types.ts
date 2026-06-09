/**
 * Provider-agnostic LLM interface.
 *
 * Every concrete provider (Gemini / OpenAI / Ollama) implements this so the
 * rest of the app — agents, RAG, /llm routes — can stay vendor-free.
 */
export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResponse>;
  stream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
}
