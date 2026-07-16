/**
 * Recommendation read endpoints. Writes happen via /agents/analyze.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

function serialize(r: {
  id: number;
  symbol: string;
  action: string;
  confidence: number;
  score: number;
  summary: string;
  reasoning: string;
  contributingSignals: unknown;
  fullTrace: unknown;
  errors: unknown;
  durationMs: number;
  createdAt: Date;
}) {
  // The DB stores both `trace` (node timings) and `insights` (per-agent outputs)
  // nested inside `full_trace`. The frontend expects them flattened to the top
  // level — match that shape so the UI works for both Python and TS backends.
  const full = (r.fullTrace ?? {}) as {
    trace?: unknown;
    insights?: unknown;
    report?: unknown;
    rating?: unknown;
    actions?: unknown;
    warnings?: unknown;
  };
  // Derive a 5-level rating for rows written before the comprehensive-report
  // upgrade (they only carried a 3-level `action`).
  const rating =
    typeof full.rating === "string"
      ? full.rating
      : r.action === "buy"
      ? "buy"
      : r.action === "sell"
      ? "sell"
      : "hold";
  return {
    id: r.id,
    symbol: r.symbol,
    action: r.action,
    rating,
    confidence: r.confidence,
    score: r.score,
    summary: r.summary,
    reasoning: r.reasoning,
    contributing_signals: r.contributingSignals,
    report: (full.report ?? null) as Record<string, unknown> | null,
    actions: Array.isArray(full.actions) ? full.actions : [],
    warnings: Array.isArray(full.warnings) ? full.warnings : [],
    trace: Array.isArray(full.trace) ? full.trace : [],
    insights: (full.insights ?? {}) as Record<string, unknown>,
    full_trace: r.fullTrace,
    errors: Array.isArray(r.errors) ? r.errors : [],
    duration_ms: r.durationMs,
    created_at: r.createdAt.toISOString(),
  };
}

export default async function recommendationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get<{ Querystring: { limit?: string; symbol?: string } }>("/", async (req) => {
    const where: Record<string, unknown> = { userId: req.currentUser!.id };
    if (req.query.symbol) where.symbol = req.query.symbol.toUpperCase();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await prisma.recommendation.findMany({
      where: where as never,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(serialize);
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const r = await prisma.recommendation.findFirst({
      where: { id: Number(req.params.id), userId: req.currentUser!.id },
    });
    if (!r) return reply.code(404).send({ detail: "Not found" });
    return serialize(r);
  });
}
