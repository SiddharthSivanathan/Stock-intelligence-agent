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
import {
  extractJson,
  looseSentiment,
  looseConfidence,
  looseScore,
  looseString,
  scoreFromAction,
} from "../normalize.js";

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

/** Max full LLM attempts (initial + repairs) before an agent gives up. */
const MAX_ATTEMPTS = 3;

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

      // Robust parse+validate loop: on any failure we feed the exact error back
      // to the model and retry, so a small model self-corrects instead of the
      // agent crashing. Temperature is pinned to 0 on repair for determinism.
      const convo: ChatMessage[] = [...messages];
      let validated: TOut | null = null;
      let lastError = "";
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const resp = await llm.chat(convo, {
          temperature: attempt === 0 ? 0.1 : 0,
          jsonMode: true,
        });
        try {
          const parsed = extractJson(resp.content);
          validated = finalizeInsight(this.outputSchema.parse(parsed) as TOut);
          break;
        } catch (e) {
          lastError = (e as Error).message;
          convo.push({ role: "assistant", content: resp.content });
          convo.push({
            role: "user",
            content:
              `That response was rejected: ${lastError}\n` +
              "Reply with ONLY a single valid JSON object matching the requested schema. " +
              "No markdown, no code fences, no commentary. Every required field must be present.",
          });
        }
      }
      if (!validated) throw new Error(`agent output invalid after ${MAX_ATTEMPTS} attempts: ${lastError}`);
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

/**
 * Common JSON envelope reused by every agent. Deliberately lenient: local
 * models phrase sentiment/score/confidence loosely, so we coerce rather than
 * reject. Kept a plain ZodObject so agents can `.extend()` it. Missing scores
 * are synthesised in `run()` (see `finalizeInsight`), not here.
 */
export const baseInsightSchema = z.object({
  sentiment: looseSentiment(),
  confidence: looseConfidence(0.5),
  score: looseScore(),
  summary: looseString(),
});

/** Fill a synthesised score / summary when the model left them blank. */
function finalizeInsight<T extends Record<string, unknown>>(o: T): T {
  const sentiment = (o.sentiment as string) ?? "neutral";
  const confidence = typeof o.confidence === "number" ? o.confidence : 0.5;
  const score =
    typeof o.score === "number"
      ? o.score
      : scoreFromAction(
          sentiment === "bullish" ? "buy" : sentiment === "bearish" ? "sell" : "hold",
          confidence,
        );
  return { ...o, score, summary: (o.summary as string) || "No summary provided." };
}
