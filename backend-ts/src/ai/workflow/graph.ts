/**
 * Multi-agent workflow.
 *
 *   ┌──────────┐
 *   │  start   │
 *   └────┬─────┘
 *        │ (fanout, parallel)
 *   ┌────┴──────────────────────────────────────┐
 *   │ news    technical    fundamentals          │
 *   │ sentiment    risk                           │
 *   └────┬──────────────────────────────────────┘
 *        │ (join)
 *   ┌────┴─────┐
 *   │  recommend   │
 *   └────┬─────┘
 *        │ confidence < 0.4 ?  →  loop (max 2 reflections)
 *   ┌────┴─────┐
 *   │   end    │
 *   └──────────┘
 *
 * No LangGraph dep — the DAG is small enough to express directly. Each node's
 * timing and status is recorded in `trace` so the Agent Monitor UI is unchanged.
 */
import { prisma } from "../../db.js";
import { agents, type AgentName } from "../agents/registry.js";
import { getLLM } from "../llm/factory.js";
import { z } from "zod";

const recommendationSchema = z.object({
  action: z.enum(["buy", "hold", "sell"]),
  confidence: z.number().min(0).max(1),
  score: z.number().min(-1).max(1),
  summary: z.string(),
  reasoning: z.string(),
  contributing_signals: z
    .array(
      z.object({
        agent: z.string(),
        sentiment: z.string().nullable().optional(),
        score: z.number().nullable().optional(),
        weight: z.number(),
        note: z.string().optional(),
      }),
    )
    .default([]),
});

interface TraceEntry {
  node: string;
  status: "success" | "failed";
  duration_ms: number;
}

interface SignalSet {
  news?: any;
  technical?: any;
  fundamentals?: any;
  sentiment?: any;
  risk?: any;
}

function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.search(/[{\[]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function runSignalAgent(
  name: AgentName,
  symbol: string,
  userId: number,
): Promise<{ ok: true; output: any; ms: number } | { ok: false; error: string; ms: number }> {
  const t0 = Date.now();
  try {
    const r = await agents[name].run({ symbol, userId });
    return { ok: true, output: r.output, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message, ms: Date.now() - t0 };
  }
}

async function recommend(
  symbol: string,
  signals: SignalSet,
  errors: { agent: string; error: string }[],
  reflectionNote?: string,
): Promise<z.infer<typeof recommendationSchema>> {
  const llm = getLLM();
  const ctx = JSON.stringify(signals, null, 2);
  const errs = errors.length ? `\nKnown agent failures: ${JSON.stringify(errors)}` : "";
  const reflect = reflectionNote ? `\n\nPrevious attempt was low-confidence. ${reflectionNote}` : "";

  const resp = await llm.chat(
    [
      {
        role: "system",
        content:
          "You are the head analyst combining signals from five specialist agents. " +
          "Output a single buy/hold/sell decision in strict JSON. Weight signals you " +
          "deem more reliable higher. If 1-2 signals are missing, still produce a verdict " +
          "but lower confidence.",
      },
      {
        role: "user",
        content:
          `Symbol: ${symbol}\nSignal agents' outputs:\n${ctx}${errs}${reflect}\n\n` +
          'Reply ONLY with JSON: {"action":"buy|hold|sell","confidence":0..1,"score":-1..1,' +
          '"summary":"one line","reasoning":"multi-sentence","contributing_signals":[{"agent":"...","sentiment":"...","score":...,"weight":0..1,"note":"..."}]}',
      },
    ],
    { temperature: 0.2, jsonMode: true },
  );
  return recommendationSchema.parse(parseJson(resp.content));
}

export interface WorkflowResult {
  id: number;
  symbol: string;
  action: "buy" | "hold" | "sell";
  confidence: number;
  score: number;
  summary: string;
  reasoning: string;
  contributing_signals: z.infer<typeof recommendationSchema>["contributing_signals"];
  insights: SignalSet;
  errors: { agent: string; error: string }[];
  trace: TraceEntry[];
  duration_ms: number;
}

export async function runWorkflow(symbol: string, userId: number): Promise<WorkflowResult> {
  const start = Date.now();
  const trace: TraceEntry[] = [];
  const errors: { agent: string; error: string }[] = [];
  const signals: SignalSet = {};

  // --- parallel fanout: 5 signal agents ---
  const names: AgentName[] = ["news", "technical", "fundamentals", "sentiment", "risk"];
  const results = await Promise.all(names.map((n) => runSignalAgent(n, symbol, userId)));
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const r = results[i];
    if (r.ok) {
      signals[name] = r.output;
      trace.push({ node: name, status: "success", duration_ms: r.ms });
    } else {
      errors.push({ agent: name, error: r.error });
      trace.push({ node: name, status: "failed", duration_ms: r.ms });
    }
  }

  // --- recommendation + up to 2 reflection loops ---
  let rec: z.infer<typeof recommendationSchema>;
  {
    const t0 = Date.now();
    try {
      rec = await recommend(symbol, signals, errors);
      trace.push({ node: "recommendation", status: "success", duration_ms: Date.now() - t0 });
    } catch (e) {
      trace.push({ node: "recommendation", status: "failed", duration_ms: Date.now() - t0 });
      throw e;
    }
  }

  let reflectionCount = 0;
  while (rec.confidence < 0.4 && reflectionCount < 2) {
    const t0 = Date.now();
    try {
      rec = await recommend(
        symbol,
        signals,
        errors,
        "Re-examine the signals and either commit to a verdict with stronger justification or raise confidence based on convergence.",
      );
      trace.push({ node: "recommendation", status: "success", duration_ms: Date.now() - t0 });
    } catch (e) {
      trace.push({ node: "recommendation", status: "failed", duration_ms: Date.now() - t0 });
      break;
    }
    reflectionCount++;
  }

  const durationMs = Date.now() - start;

  // --- persist ---
  const row = await prisma.recommendation.create({
    data: {
      userId,
      symbol,
      action: rec.action,
      confidence: rec.confidence,
      score: rec.score,
      summary: rec.summary,
      reasoning: rec.reasoning,
      contributingSignals: rec.contributing_signals as never,
      fullTrace: { trace, insights: signals } as never,
      errors: errors as never,
      durationMs,
    },
  });

  return {
    id: row.id,
    symbol,
    action: rec.action,
    confidence: rec.confidence,
    score: rec.score,
    summary: rec.summary,
    reasoning: rec.reasoning,
    contributing_signals: rec.contributing_signals,
    insights: signals,
    errors,
    trace,
    duration_ms: durationMs,
  };
}
