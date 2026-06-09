/**
 * Public LLM endpoints (no auth — mirror the Python backend).
 *
 *   POST /llm/chat    one-shot chat completion
 *   POST /llm/embed   embed a list of texts
 *   POST /llm/stream  SSE-style streaming chat
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getLLM } from "../ai/llm/factory.js";
import { embed } from "../ai/embeddings/embedder.js";

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  json_mode: z.boolean().optional(),
});

const embedSchema = z.object({
  texts: z.array(z.string()).min(1).max(256),
});

export default async function llmRoutes(app: FastifyInstance) {
  app.post("/chat", async (req, reply) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    const llm = getLLM();
    return llm.chat(parsed.data.messages, {
      temperature: parsed.data.temperature,
      maxTokens: parsed.data.max_tokens,
      jsonMode: parsed.data.json_mode,
    });
  });

  app.post("/embed", async (req, reply) => {
    const parsed = embedSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    return embed(parsed.data.texts);
  });

  app.post("/stream", async (req, reply) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    // Hand control of the raw socket to us so Fastify doesn't try to send a body.
    reply.hijack();
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders?.();

    const llm = getLLM();
    try {
      for await (const chunk of llm.stream(parsed.data.messages, {
        temperature: parsed.data.temperature,
        maxTokens: parsed.data.max_tokens,
      })) {
        reply.raw.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      }
      reply.raw.write("data: [DONE]\n\n");
    } catch (e) {
      reply.raw.write(`data: ${JSON.stringify({ error: (e as Error).message })}\n\n`);
    } finally {
      reply.raw.end();
    }
  });
}
