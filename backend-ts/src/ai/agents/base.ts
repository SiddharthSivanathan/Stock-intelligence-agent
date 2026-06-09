/**
 * Common scaffold every agent uses.
 *
 *   1. record `startedAt`
 *   2. run the agent's `act()` with the LLM
 *   3. validate the JSON output against a Zod schema (one retry on parse fail)
 *   4. persist an Insight row + AgentLog row (success OR failure)
 *
 * Concrete agents only implement `name`, `outputSchema`, and `act()`.
 */
import { z, type ZodTypeAny } from "zod";
import { prisma } from "../../db.js";
import { getLLM } from "../llm/factory.js";
import type { ChatMessage } from "../llm/types.js";

export interface AgentContext {
  symbol: string;
  userId?: number;
  [k: string]: unknown;
}

export interface AgentResult<T> {
  output: T;
  insightId: number;
  logId: number;
  durationMs: number;
}

function tryParseJson(raw: string): unknown {
  // Strip ```json fences a small model sometimes emits.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  // Find the first { … } or [ … ] block.
  const start = cleaned.search(/[{\[]/);
  if (start < 0) throw new Error("No JSON object found in model output");
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (end < start) throw new Error("Malformed JSON in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export abstract class BaseAgent<TOut extends Record<string, unknown>> {
  abstract readonly name: string;
  abstract readonly outputSchema: ZodTypeAny;

  /** Build chat messages for the LLM. Concrete agents construct grounded prompts. */
  protected abstract buildPrompt(ctx: AgentContext): Promise<{
    messages: ChatMessage[];
    /** Extra structured data to attach to the persisted Insight.data field. */
    passthrough?: Record<string, unknown>;
  }>;

  /**
   * Run the agent end-to-end. Always returns a result OR throws — but either
   * way an AgentLog row is written so the Agent Monitor never has gaps.
   */
  async run(ctx: AgentContext): Promise<AgentResult<TOut>> {
    const startedAt = Date.now();
    let input: Record<string, unknown> = { ...ctx };
    let passthrough: Record<string, unknown> = {};
    const llm = getLLM();
    try {
      const { messages, passthrough: pt } = await this.buildPrompt(ctx);
      passthrough = pt ?? {};
      input = { ...input, prompt_messages: messages.length };

      let resp = await llm.chat(messages, { temperature: 0.2, jsonMode: true });
      let parsed: unknown;
      try {
        parsed = tryParseJson(resp.content);
      } catch (e) {
        // single retry: tell the model what went wrong
        const retry = await llm.chat(
          [
            ...messages,
            { role: "assistant", content: resp.content },
            {
              role: "user",
              content: `Your last output failed JSON parsing: ${(e as Error).message}. Reply ONLY with valid JSON matching the requested schema.`,
            },
          ],
          { temperature: 0, jsonMode: true },
        );
        resp = retry;
        parsed = tryParseJson(retry.content);
      }

      const validated = this.outputSchema.parse(parsed) as TOut;
      const durationMs = Date.now() - startedAt;

      // Persist Insight
      const insight = await prisma.insight.create({
        data: {
          userId: ctx.userId ?? null,
          agentName: this.name,
          symbol: ctx.symbol,
          sentiment: (validated.sentiment as string | undefined) ?? null,
          confidence: (validated.confidence as number | undefined) ?? null,
          score: (validated.score as number | undefined) ?? null,
          summary: (validated.summary as string | undefined) ?? null,
          data: { ...validated, ...passthrough } as never,
        },
      });

      const log = await prisma.agentLog.create({
        data: {
          userId: ctx.userId ?? null,
          agentName: this.name,
          symbol: ctx.symbol,
          status: "success",
          durationMs,
          inputData: input as never,
          outputData: validated as never,
          provider: llm.name,
          model: llm.model,
        },
      });

      return { output: validated, insightId: insight.id, logId: log.id, durationMs };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await prisma.agentLog.create({
        data: {
          userId: ctx.userId ?? null,
          agentName: this.name,
          symbol: ctx.symbol,
          status: "failed",
          durationMs,
          inputData: input as never,
          error: (err as Error).message,
          provider: llm.name,
          model: llm.model,
        },
      });
      throw err;
    }
  }
}

/** Common JSON envelope reused by every agent. */
export const baseInsightSchema = z.object({
  sentiment: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number().min(0).max(1),
  score: z.number().min(-1).max(1),
  summary: z.string(),
});
