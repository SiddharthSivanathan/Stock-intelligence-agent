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
import { randomUUID } from "node:crypto";
import { prisma } from "../../db.js";
import { agents, type AgentName } from "../agents/registry.js";
import { getLLM } from "../llm/factory.js";
import type { ChatMessage } from "../llm/types.js";
import { z } from "zod";
import {
  extractJson,
  normalizeAction,
  normalizeRating,
  parseScoreMinus1To1,
  parseConfidence,
  scoreFromAction,
  score0to100,
  clamp,
  type Action,
} from "../normalize.js";

// Lenient text/number/array helpers — a small model occasionally omits a field
// or returns the wrong scalar type. We never want the whole comprehensive report
// to fail parsing over one soft field, so everything in `report` has a default.
const str = z.string().optional().default("");
const strArr = z.array(z.string()).optional().default([]);
const num0to100 = z.coerce.number().min(0).max(100).optional().default(50);

/** The rich, explainable company report surfaced in AI Insights. */
const reportSchema = z
  .object({
    executive_summary: str,
    business_overview: str,
    competitive_position: str,
    industry_analysis: str,
    swot: z
      .object({
        strengths: strArr,
        weaknesses: strArr,
        opportunities: strArr,
        threats: strArr,
      })
      .default({}),
    financial_health_score: num0to100,
    growth_potential: str,
    profitability: str,
    valuation: str,
    technical_summary: str,
    sentiment_summary: str,
    news_impact: str,
    risk_assessment: str,
    key_strengths: strArr,
    key_weaknesses: strArr,
    opportunities: strArr,
    risks: strArr,
    long_term_outlook: str,
    short_term_outlook: str,
  })
  .default({});

/** One actionable, evidence-backed recommendation card. */
const actionSchema = z.object({
  type: z
    .enum([
      "investment",
      "risk_alert",
      "growth_opportunity",
      "competitive_threat",
      "sector_trend",
      "technical_signal",
      "news_event",
      "earnings_impact",
      "watchlist",
      "portfolio",
    ])
    .catch("investment"),
  title: z.string(),
  detail: z.string().optional().default(""),
  confidence: z.coerce.number().min(0).max(1).optional().default(0.5),
});

// Lenient synthesis schema. A local model returns "reduce"/"accumulate" for
// action, omits score, and returns confidence on a 0-100 scale — none of which
// should crash the pipeline. We coerce everything and never reject on a soft
// field; the only hard requirement is that SOME JSON object came back.
const recommendationSchema = z.object({
  // Accept any verdict word → buy|hold|sell ("reduce"→sell, "accumulate"→buy…).
  action: z.any().transform((v) => normalizeAction(v)),
  // 5-level rating — coerced later against the action; kept raw here.
  rating: z.any().optional(),
  confidence: z.any().transform((v) => parseConfidence(v, 0.55)),
  // number | null — synthesised from the action when the model omits it.
  score: z.any().transform((v) => parseScoreMinus1To1(v)),
  summary: z.any().optional(),
  reasoning: z.any().optional(),
  contributing_signals: z
    .array(
      z.object({
        agent: z.string(),
        sentiment: z.string().nullable().optional(),
        score: z.number().nullable().optional(),
        weight: z.coerce.number().catch(0.5),
        note: z.string().optional(),
      }),
    )
    .catch([]),
  report: reportSchema,
  actions: z.array(actionSchema).catch([]),
});

/** Fully-resolved synthesis output after coercion + defaults are applied. */
interface ResolvedRecommendation {
  action: Action;
  rating: "strong_buy" | "buy" | "hold" | "reduce" | "sell";
  confidence: number;
  score: number;
  summary: string;
  reasoning: string;
  contributing_signals: z.infer<typeof recommendationSchema>["contributing_signals"];
  report: z.infer<typeof reportSchema>;
  actions: z.infer<typeof actionSchema>[];
}

/** Fallback 5-level rating from the 3-level action + numeric conviction. */
function deriveRating(
  action: "buy" | "hold" | "sell",
  score: number,
  confidence: number,
): "strong_buy" | "buy" | "hold" | "reduce" | "sell" {
  const conviction = Math.abs(score) * confidence;
  if (action === "buy") return conviction >= 0.5 ? "strong_buy" : "buy";
  if (action === "sell") return conviction >= 0.5 ? "sell" : "reduce";
  return "hold";
}

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

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
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

const SYNTH_SYSTEM =
  "You are the Chief Investment Officer writing an institutional-grade equity research " +
  "report by combining five specialist agents (news, technical, fundamentals, sentiment, " +
  "risk). Output rules you MUST follow:\n" +
  "1. Respond with ONE JSON object and NOTHING else — no markdown, no code fences, no prose.\n" +
  '2. "action" MUST be exactly one of: "buy", "hold", "sell". Do not use words like ' +
  '"reduce" or "accumulate".\n' +
  '3. "score" is a number from -1 (very bearish) to 1 (very bullish). "confidence" is 0 to 1.\n' +
  "4. Every string field must be filled with substantive, specific analysis grounded in the " +
  "signals — never leave a field blank or write 'N/A'. If a data point is unavailable, reason " +
  "from what IS available and say so.\n" +
  "5. Write detailed, professional prose in each report field (2-5 sentences each).";

/** Build the (large) user prompt describing the exact JSON contract. */
function synthUserPrompt(
  symbol: string,
  signals: SignalSet,
  errors: { agent: string; error: string }[],
  reflectionNote?: string,
): string {
  const ctx = JSON.stringify(signals, null, 2);
  const errs = errors.length
    ? `\nSome agents failed (reason from the rest): ${JSON.stringify(errors)}`
    : "";
  const reflect = reflectionNote ? `\n\nPrevious attempt was weak. ${reflectionNote}` : "";
  return (
    `Symbol: ${symbol}\nSpecialist agent outputs:\n${ctx}${errs}${reflect}\n\n` +
    "Return ONLY this JSON object (fill every field with real analysis):\n" +
    "{\n" +
    '  "action":"buy|hold|sell",\n' +
    '  "rating":"strong_buy|buy|hold|reduce|sell",\n' +
    '  "confidence":0.0-1.0, "score":-1.0-1.0,\n' +
    '  "summary":"one-line verdict", "reasoning":"3-5 sentence justification",\n' +
    '  "contributing_signals":[{"agent":"news|technical|fundamentals|sentiment|risk","sentiment":"bullish|bearish|neutral","score":-1..1,"weight":0..1,"note":"how it influenced the call"}],\n' +
    '  "report":{\n' +
    '    "executive_summary":"...", "business_overview":"...", "competitive_position":"...",\n' +
    '    "industry_analysis":"...",\n' +
    '    "swot":{"strengths":["..."],"weaknesses":["..."],"opportunities":["..."],"threats":["..."]},\n' +
    '    "financial_health_score":0-100, "growth_potential":"...", "profitability":"...",\n' +
    '    "valuation":"...", "technical_summary":"...", "sentiment_summary":"...",\n' +
    '    "news_impact":"...", "risk_assessment":"...",\n' +
    '    "key_strengths":["..."], "key_weaknesses":["..."], "opportunities":["..."], "risks":["..."],\n' +
    '    "long_term_outlook":"...", "short_term_outlook":"..."\n' +
    "  },\n" +
    '  "actions":[{"type":"investment|risk_alert|growth_opportunity|competitive_threat|sector_trend|technical_signal|news_event|earnings_impact|watchlist|portfolio","title":"...","detail":"reasoning + evidence","confidence":0..1}]\n' +
    "}"
  );
}

function asStr(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v.trim() : String(v);
}

/** Apply coercion + synthesised defaults to a parsed synthesis object. */
function resolveRecommendation(
  parsed: z.infer<typeof recommendationSchema>,
): ResolvedRecommendation {
  const action = parsed.action;
  const confidence = clamp(parsed.confidence, 0, 1);
  const score = parsed.score ?? scoreFromAction(action, confidence);
  const rating =
    parsed.rating != null && asStr(parsed.rating)
      ? normalizeRating(parsed.rating, action)
      : deriveRating(action, score, confidence);
  return {
    action,
    rating,
    confidence,
    score,
    summary: asStr(parsed.summary) || `${action.toUpperCase()} — see detailed report.`,
    reasoning: asStr(parsed.reasoning) || asStr(parsed.summary),
    contributing_signals: parsed.contributing_signals,
    report: parsed.report,
    actions: parsed.actions,
  };
}

/**
 * Ask the model for the synthesis, retrying with the exact error on any parse
 * or validation failure so a small model self-corrects. Throws only if every
 * attempt fails — the caller then falls back to a deterministic recommendation.
 */
async function recommend(
  symbol: string,
  signals: SignalSet,
  errors: { agent: string; error: string }[],
  reflectionNote?: string,
): Promise<ResolvedRecommendation> {
  const llm = getLLM();
  const convo: ChatMessage[] = [
    { role: "system", content: SYNTH_SYSTEM },
    { role: "user", content: synthUserPrompt(symbol, signals, errors, reflectionNote) },
  ];

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await llm.chat(convo, {
      temperature: attempt === 0 ? 0.1 : 0,
      jsonMode: true,
      maxTokens: 4096,
    });
    try {
      const parsed = recommendationSchema.parse(extractJson(resp.content));
      return resolveRecommendation(parsed);
    } catch (e) {
      lastError = (e as Error).message;
      convo.push({ role: "assistant", content: resp.content });
      convo.push({
        role: "user",
        content:
          `Your response was rejected: ${lastError}\n` +
          'Return ONLY the JSON object. "action" must be buy, hold, or sell. ' +
          "Include every field. No markdown or commentary.",
      });
    }
  }
  throw new Error(`synthesis invalid after 3 attempts: ${lastError}`);
}

/**
 * Deterministic recommendation assembled directly from the signal agents when
 * the LLM synthesis can't produce valid output. Guarantees the workflow always
 * returns a usable result instead of a 502.
 */
function buildFallbackRecommendation(
  symbol: string,
  signals: SignalSet,
  errors: { agent: string; error: string }[],
): ResolvedRecommendation {
  const entries = Object.entries(signals).filter(([, v]) => v && typeof v === "object");
  const scores = entries
    .map(([, v]) => (typeof (v as any).score === "number" ? (v as any).score : null))
    .filter((n): n is number => n !== null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const action: Action = avg > 0.15 ? "buy" : avg < -0.15 ? "sell" : "hold";
  const confidence = clamp(0.3 + entries.length * 0.05, 0.2, 0.55);
  const score = clamp(avg, -1, 1);
  const rating = deriveRating(action, score, confidence);

  const strengths: string[] = [];
  const risks: string[] = [];
  const contributing_signals = entries.map(([name, v]) => {
    const o = v as any;
    const note = asStr(o.summary);
    if (typeof o.score === "number" && o.score >= 0 && note) strengths.push(`${name}: ${note}`);
    else if (note) risks.push(`${name}: ${note}`);
    return {
      agent: name,
      sentiment: asStr(o.sentiment) || null,
      score: typeof o.score === "number" ? o.score : null,
      weight: 1 / Math.max(entries.length, 1),
      note,
    };
  });

  const summary = `${action.toUpperCase()} — deterministic consensus across ${entries.length} of 5 agents (AI synthesis unavailable).`;
  const report = reportSchema.parse({
    executive_summary:
      `Automated consensus for ${symbol}: a ${action.toUpperCase()} stance derived from the ` +
      `average signal score (${score.toFixed(2)}). The narrative synthesis model was unavailable, ` +
      `so this summary is aggregated directly from the specialist agents.`,
    technical_summary: asStr((signals.technical as any)?.summary),
    sentiment_summary: asStr((signals.sentiment as any)?.summary),
    news_impact: asStr((signals.news as any)?.summary),
    risk_assessment: asStr((signals.risk as any)?.summary),
    valuation: asStr((signals.fundamentals as any)?.summary),
    key_strengths: strengths,
    key_weaknesses: risks,
    financial_health_score: score0to100(score),
    short_term_outlook: `Signals currently lean ${action}.`,
    long_term_outlook: "Insufficient AI synthesis; monitor for a full report on the next run.",
  });

  return {
    action,
    rating,
    confidence,
    score,
    summary,
    reasoning:
      "Deterministic fallback: the language model did not return a valid synthesis after retries, " +
      "so the verdict was computed from the specialist agents' average score. Re-run for a full narrative report.",
    contributing_signals,
    report,
    actions: [],
  };
}

/** Live event streamed to the Agent Monitor as the workflow progresses. */
export interface AgentEvent {
  run_id: string;
  symbol: string;
  phase: "start" | "agent" | "synthesis" | "complete" | "error";
  agent?: string;
  status: "running" | "completed" | "failed";
  task?: string;
  /** Overall workflow progress in [0, 1]. */
  progress: number;
  duration_ms?: number;
  confidence?: number;
  score?: number;
  summary?: string;
  message?: string;
  ts: string;
}

export type Report = z.infer<typeof reportSchema>;

export interface WorkflowResult {
  id: number;
  run_id: string;
  symbol: string;
  action: "buy" | "hold" | "sell";
  rating: "strong_buy" | "buy" | "hold" | "reduce" | "sell";
  confidence: number;
  score: number;
  summary: string;
  reasoning: string;
  contributing_signals: ResolvedRecommendation["contributing_signals"];
  report: Report;
  actions: ResolvedRecommendation["actions"];
  insights: SignalSet;
  errors: { agent: string; error: string }[];
  /** Non-fatal degradations (e.g. LLM synthesis fell back to heuristics). */
  warnings: string[];
  trace: TraceEntry[];
  duration_ms: number;
}

const AGENT_TASKS: Record<string, string> = {
  news: "Scanning recent headlines & news impact",
  technical: "Computing indicators & price trend",
  fundamentals: "Assessing valuation & financial health",
  sentiment: "Reading social / crowd sentiment",
  risk: "Measuring volatility, drawdown & leverage",
};

export interface RunWorkflowOptions {
  /** Called on every lifecycle transition so the UI can render live status. */
  onEvent?: (ev: AgentEvent) => void;
}

export async function runWorkflow(
  symbol: string,
  userId: number,
  opts: RunWorkflowOptions = {},
): Promise<WorkflowResult> {
  const start = Date.now();
  const run_id = randomUUID();
  const trace: TraceEntry[] = [];
  const errors: { agent: string; error: string }[] = [];
  const warnings: string[] = [];
  const signals: SignalSet = {};

  const names: AgentName[] = ["news", "technical", "fundamentals", "sentiment", "risk"];
  const TOTAL_STEPS = names.length + 1; // signal agents + synthesis
  let done = 0;
  const emit = (ev: Partial<AgentEvent> & Pick<AgentEvent, "phase" | "status">) =>
    opts.onEvent?.({
      run_id,
      symbol,
      progress: Math.min(done / TOTAL_STEPS, 1),
      ts: new Date().toISOString(),
      ...ev,
    });

  emit({ phase: "start", status: "running", task: `Analyzing ${symbol}`, message: "Workflow started", progress: 0 });

  // --- fanout: 5 signal agents, capped concurrency ---
  // Each agent makes one LLM call. Firing all 5 at once (plus the recommendation
  // call) can breach free-tier requests-per-minute limits, so we run at most a
  // few at a time. The provider also retries transient 429s as a safety net.
  const results = await mapWithConcurrency(names, 2, async (name) => {
    emit({
      phase: "agent",
      agent: name,
      status: "running",
      task: AGENT_TASKS[name],
      message: `${name} agent started`,
    });
    const r = await runSignalAgent(name, symbol, userId);
    done++;
    if (r.ok) {
      emit({
        phase: "agent",
        agent: name,
        status: "completed",
        duration_ms: r.ms,
        confidence: r.output?.confidence,
        score: r.output?.score,
        summary: r.output?.summary,
        message: `${name} agent completed`,
      });
    } else {
      emit({
        phase: "agent",
        agent: name,
        status: "failed",
        duration_ms: r.ms,
        message: `${name} agent failed: ${r.error}`,
      });
    }
    return r;
  });
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

  // --- recommendation + comprehensive report (up to 2 reflection loops) ---
  emit({
    phase: "synthesis",
    agent: "recommendation",
    status: "running",
    task: "Synthesizing unified recommendation & report",
    message: "Combining agent outputs",
  });
  let rec: ResolvedRecommendation;
  {
    const t0 = Date.now();
    try {
      rec = await recommend(symbol, signals, errors);
      trace.push({ node: "recommendation", status: "success", duration_ms: Date.now() - t0 });
    } catch (e) {
      // NEVER 502 on model output: fall back to a deterministic recommendation
      // aggregated from the signal agents, and record it as a warning.
      trace.push({ node: "recommendation", status: "failed", duration_ms: Date.now() - t0 });
      warnings.push(`AI synthesis fell back to heuristics: ${(e as Error).message}`);
      emit({
        phase: "synthesis",
        agent: "recommendation",
        status: "completed",
        message: "Synthesis fell back to deterministic consensus",
      });
      rec = buildFallbackRecommendation(symbol, signals, errors);
    }
  }

  // Reflection: only meaningful when the LLM actually produced the verdict.
  let reflectionCount = 0;
  const usedFallback = warnings.length > 0;
  while (!usedFallback && rec.confidence < 0.4 && reflectionCount < 2) {
    const t0 = Date.now();
    try {
      rec = await recommend(
        symbol,
        signals,
        errors,
        "Re-examine the signals and either commit to a verdict with stronger justification or raise confidence based on convergence.",
      );
      trace.push({ node: "recommendation", status: "success", duration_ms: Date.now() - t0 });
    } catch {
      trace.push({ node: "recommendation", status: "failed", duration_ms: Date.now() - t0 });
      break;
    }
    reflectionCount++;
  }
  done++;

  const rating = rec.rating;
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
      // `report`, `rating`, `actions` and `warnings` live inside full_trace so
      // the existing Recommendation table needs no migration — the read route
      // flattens them back to the top level.
      fullTrace: { trace, insights: signals, report: rec.report, rating, actions: rec.actions, warnings } as never,
      errors: errors as never,
      durationMs,
    },
  });

  emit({
    phase: "complete",
    status: "completed",
    progress: 1,
    duration_ms: durationMs,
    confidence: rec.confidence,
    score: rec.score,
    summary: rec.summary,
    message: `Analysis complete — ${rating.replace("_", " ").toUpperCase()}`,
  });

  return {
    id: row.id,
    run_id,
    symbol,
    action: rec.action,
    rating,
    confidence: rec.confidence,
    score: rec.score,
    summary: rec.summary,
    reasoning: rec.reasoning,
    contributing_signals: rec.contributing_signals,
    report: rec.report,
    actions: rec.actions,
    insights: signals,
    errors,
    warnings,
    trace,
    duration_ms: durationMs,
  };
}
