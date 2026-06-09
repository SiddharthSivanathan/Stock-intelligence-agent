/**
 * Read-only access to persisted Insight rows.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export default async function insightRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get<{
    Querystring: { agent?: string; symbol?: string; limit?: string };
  }>("/", async (req) => {
    const where: Record<string, unknown> = { userId: req.currentUser!.id };
    if (req.query.agent) where.agentName = req.query.agent;
    if (req.query.symbol) where.symbol = req.query.symbol.toUpperCase();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await prisma.insight.findMany({
      where: where as never,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      agent_name: r.agentName,
      symbol: r.symbol,
      sentiment: r.sentiment,
      confidence: r.confidence,
      score: r.score,
      summary: r.summary,
      data: r.data,
      created_at: r.createdAt.toISOString(),
    }));
  });
}
