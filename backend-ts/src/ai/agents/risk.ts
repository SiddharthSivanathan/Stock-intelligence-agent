/**
 * Risk Agent — volatility, drawdown, leverage. Score is INVERTED: +1 = safest.
 */
import { z } from "zod";
import { BaseAgent, baseInsightSchema, type AgentContext } from "./base.js";
import * as market from "../../services/market.js";
import { computeIndicators } from "../indicators.js";
import { quoteSummary, rawOf } from "../../services/yahooDirect.js";

const schema = baseInsightSchema.extend({
  risk_level: z.enum(["low", "moderate", "high", "extreme"]).catch("moderate"),
  factors: z.array(z.string()).default([]),
});

export class RiskAgent extends BaseAgent<z.infer<typeof schema>> {
  readonly name = "risk";
  readonly outputSchema = schema;

  protected async buildPrompt(ctx: AgentContext) {
    const range = (ctx.range as string) ?? "1y";
    const candles = await market.getHistory(ctx.symbol, "1d", range);
    const closes = candles.map((c) => c.close);
    const ind = computeIndicators(closes);

    let beta: number | null = null;
    let debtToEquity: number | null = null;
    try {
      const r = await quoteSummary(ctx.symbol, ["defaultKeyStatistics", "financialData"]);
      const ks = (r.defaultKeyStatistics ?? {}) as Record<string, unknown>;
      const fd = (r.financialData ?? {}) as Record<string, unknown>;
      const b = rawOf(ks.beta);
      const d = rawOf(fd.debtToEquity);
      beta = typeof b === "number" ? b : null;
      debtToEquity = typeof d === "number" ? d : null;
    } catch {
      /* tolerate fundamentals fetch failures */
    }

    const factors = {
      volatility_30d_pct: ind?.volatility_30d_pct ?? null,
      max_drawdown_pct: ind?.max_drawdown_pct ?? null,
      beta,
      debt_to_equity: debtToEquity,
    };

    return {
      passthrough: { factors },
      messages: [
        {
          role: "system" as const,
          content:
            "You are a risk analyst. Higher volatility, deeper drawdown, higher beta and " +
            "higher leverage all increase risk. Score is INVERTED: +1 means very safe, " +
            "-1 means very risky.",
        },
        {
          role: "user" as const,
          content:
            `Symbol: ${ctx.symbol}\nFactors:\n${JSON.stringify(factors, null, 2)}\n\n` +
            'Reply ONLY with JSON: {"sentiment":"bullish|bearish|neutral","confidence":0..1,' +
            '"score":-1..1,"summary":"...","risk_level":"low|moderate|high|extreme",' +
            '"factors":["..."]}',
        },
      ],
    };
  }
}
