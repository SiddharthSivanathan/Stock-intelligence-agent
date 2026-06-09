/**
 * Fundamentals Agent — ratios from yahoo-finance2 + optional RAG over filings.
 */
import { z } from "zod";
import { BaseAgent, baseInsightSchema, type AgentContext } from "./base.js";
import { query as ragQuery } from "../vectorstore/chroma.js";
import { quoteSummary, rawOf } from "../../services/yahooDirect.js";

const schema = baseInsightSchema.extend({
  valuation: z.enum(["overvalued", "fair", "undervalued"]),
  financial_health: z.enum(["strong", "moderate", "weak"]),
  key_metrics: z.record(z.union([z.string(), z.number(), z.null()])).default({}),
});

async function getFundamentals(symbol: string): Promise<Record<string, unknown>> {
  try {
    const r = await quoteSummary(symbol, [
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
      "price",
    ]);
    const sd = (r.summaryDetail ?? {}) as Record<string, unknown>;
    const ks = (r.defaultKeyStatistics ?? {}) as Record<string, unknown>;
    const fd = (r.financialData ?? {}) as Record<string, unknown>;
    const pr = (r.price ?? {}) as Record<string, unknown>;
    return {
      pe_ratio: rawOf(sd.trailingPE),
      forward_pe: rawOf(sd.forwardPE),
      peg: rawOf(ks.pegRatio),
      price_to_book: rawOf(ks.priceToBook),
      profit_margin: rawOf(ks.profitMargins),
      return_on_equity: rawOf(fd.returnOnEquity),
      debt_to_equity: rawOf(fd.debtToEquity),
      current_ratio: rawOf(fd.currentRatio),
      revenue_growth: rawOf(fd.revenueGrowth),
      earnings_growth: rawOf(fd.earningsGrowth),
      market_cap: rawOf(pr.marketCap),
    };
  } catch {
    return {};
  }
}

export class FundamentalsAgent extends BaseAgent<z.infer<typeof schema>> {
  readonly name = "fundamentals";
  readonly outputSchema = schema;

  protected async buildPrompt(ctx: AgentContext) {
    const metrics = await getFundamentals(ctx.symbol);
    let ragContext = "";
    if (ctx.use_rag) {
      const hits = await ragQuery(
        `Recent financial performance and risks for ${ctx.symbol}`,
        4,
        { symbol: ctx.symbol, user_id: ctx.userId },
      );
      if (hits.length) {
        ragContext =
          "\n\nRelevant excerpts from your uploaded filings:\n" +
          hits.map((h, i) => `[${i + 1}] ${h.text.slice(0, 600)}`).join("\n\n");
      }
    }

    return {
      passthrough: { metrics },
      messages: [
        {
          role: "system" as const,
          content:
            "You are an equity fundamentals analyst. Judge valuation and financial health " +
            "from the metrics (and excerpts, if any). Output JSON only.",
        },
        {
          role: "user" as const,
          content:
            `Symbol: ${ctx.symbol}\nMetrics:\n${JSON.stringify(metrics, null, 2)}${ragContext}\n\n` +
            'Reply ONLY with JSON: {"sentiment":"bullish|bearish|neutral","confidence":0..1,' +
            '"score":-1..1,"summary":"...","valuation":"overvalued|fair|undervalued",' +
            '"financial_health":"strong|moderate|weak","key_metrics":{...}}',
        },
      ],
    };
  }
}
