/**
 * Technical Agent — Python computes RSI/MACD/Bollinger/SMA, LLM interprets.
 */
import { z } from "zod";
import { BaseAgent, baseInsightSchema, type AgentContext } from "./base.js";
import * as market from "../../services/market.js";
import { computeIndicators } from "../indicators.js";

// Small open-weights models (Mistral 7B) often emit directional words for
// `momentum` ("bullish"/"bearish") even when the prompt asks for magnitude.
// Accept both vocabularies and treat directional words as a strong signal.
const momentumSchema = z
  .enum(["strong", "weak", "neutral", "bullish", "bearish"])
  .transform((v) => {
    if (v === "bullish" || v === "bearish") return "strong" as const;
    return v;
  });

const schema = baseInsightSchema.extend({
  trend: z
    .enum(["uptrend", "downtrend", "sideways", "bullish", "bearish", "neutral"])
    .transform((v) => {
      if (v === "bullish") return "uptrend" as const;
      if (v === "bearish") return "downtrend" as const;
      if (v === "neutral") return "sideways" as const;
      return v;
    }),
  momentum: momentumSchema,
  signals: z.array(z.string()).default([]),
});

export class TechnicalAgent extends BaseAgent<z.infer<typeof schema>> {
  readonly name = "technical";
  readonly outputSchema = schema;

  protected async buildPrompt(ctx: AgentContext) {
    const range = (ctx.range as string) ?? "6mo";
    const interval = (ctx.interval as string) ?? "1d";
    const candles = await market.getHistory(ctx.symbol, interval, range);
    const closes = candles.map((c) => c.close);
    const ind = computeIndicators(closes);
    if (!ind) {
      // Not enough data — short-circuit to a low-confidence neutral, but still
      // produce a valid schema output.
      return {
        passthrough: { indicators: null, bars: closes.length },
        messages: [
          {
            role: "system" as const,
            content: "You are a technical analyst. Output JSON only.",
          },
          {
            role: "user" as const,
            content: `Not enough price history for ${ctx.symbol} (${closes.length} bars). Reply with a neutral, low-confidence JSON: {"sentiment":"neutral","confidence":0.1,"score":0,"summary":"Insufficient history","trend":"sideways","momentum":"neutral","signals":[]}`,
          },
        ],
      };
    }

    return {
      passthrough: { indicators: ind, bars: closes.length },
      messages: [
        {
          role: "system" as const,
          content:
            "You are a technical analyst. Interpret the indicator snapshot and emit a " +
            "strict JSON judgement. Do not invent numbers — only describe what the inputs imply.",
        },
        {
          role: "user" as const,
          content:
            `Symbol: ${ctx.symbol}\nIndicators (latest):\n${JSON.stringify(ind, null, 2)}\n\n` +
            'Reply ONLY with JSON: {"sentiment":"bullish|bearish|neutral","confidence":0..1,' +
            '"score":-1..1,"summary":"...","trend":"uptrend|downtrend|sideways",' +
            '"momentum":"strong|weak|neutral","signals":["..."]}',
        },
      ],
    };
  }
}
