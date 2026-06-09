/**
 * Agent endpoints.
 *
 *   POST /agents/:name/run     run one agent (news|technical|fundamentals|sentiment|risk)
 *   POST /agents/analyze       run the full multi-agent workflow (Phase 7)
 *   GET  /agents/logs          recent runs across all agents
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { agents, type AgentName } from "../ai/agents/registry.js";
import { runWorkflow } from "../ai/workflow/graph.js";

const runSchema = z.object({
  symbol: z.string().min(1).max(20),
  limit: z.number().int().positive().optional(),
  range: z.string().optional(),
  interval: z.string().optional(),
  use_rag: z.boolean().optional(),
});

const analyzeSchema = z.object({
  symbol: z.string().min(1).max(20),
});

export default async function agentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post<{ Params: { name: string } }>("/:name/run", async (req, reply) => {
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    const name = req.params.name as AgentName;
    const agent = agents[name];
    if (!agent) return reply.code(404).send({ detail: `Unknown agent: ${name}` });
    try {
      const result = await agent.run({
        ...parsed.data,
        symbol: parsed.data.symbol.toUpperCase(),
        userId: req.currentUser!.id,
      });
      return { symbol: parsed.data.symbol.toUpperCase(), ...result.output };
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ detail: (e as Error).message });
    }
  });

  app.post("/analyze", async (req, reply) => {
    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    try {
      const result = await runWorkflow(parsed.data.symbol.toUpperCase(), req.currentUser!.id);
      return result;
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ detail: (e as Error).message });
    }
  });

  app.get<{
    Querystring: { agent?: string; symbol?: string; limit?: string };
  }>("/logs", async (req) => {
    const where: Record<string, unknown> = { userId: req.currentUser!.id };
    if (req.query.agent) where.agentName = req.query.agent;
    if (req.query.symbol) where.symbol = req.query.symbol.toUpperCase();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await prisma.agentLog.findMany({
      where: where as never,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      agent_name: r.agentName,
      symbol: r.symbol,
      status: r.status,
      duration_ms: r.durationMs,
      error: r.error,
      provider: r.provider,
      model: r.model,
      input_data: r.inputData,
      output_data: r.outputData,
      created_at: r.createdAt.toISOString(),
    }));
  });
}
