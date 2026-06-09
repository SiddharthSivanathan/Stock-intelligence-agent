/**
 * Alert rules CRUD + event feed.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const createSchema = z.object({
  symbol: z.string().min(1).max(20),
  condition_type: z.string().default("price_change_pct"),
  direction: z.enum(["above", "below"]),
  threshold: z.number(),
  cooldown_seconds: z.number().int().nonnegative().optional(),
  notify_via_ws: z.boolean().optional(),
  notify_via_email: z.boolean().optional(),
  re_run_analysis: z.boolean().optional(),
});

const updateSchema = createSchema.partial().extend({
  is_active: z.boolean().optional(),
});

function serializeRule(r: {
  id: number;
  symbol: string;
  conditionType: string;
  direction: string;
  threshold: number;
  isActive: boolean;
  cooldownSeconds: number;
  notifyViaWs: boolean;
  notifyViaEmail: boolean;
  reRunAnalysis: boolean;
  lastTriggeredAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    symbol: r.symbol,
    condition_type: r.conditionType,
    direction: r.direction,
    threshold: r.threshold,
    is_active: r.isActive,
    cooldown_seconds: r.cooldownSeconds,
    notify_via_ws: r.notifyViaWs,
    notify_via_email: r.notifyViaEmail,
    re_run_analysis: r.reRunAnalysis,
    last_triggered_at: r.lastTriggeredAt?.toISOString() ?? null,
    created_at: r.createdAt.toISOString(),
  };
}

export default async function alertRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (req) => {
    const rules = await prisma.alertRule.findMany({
      where: { userId: req.currentUser!.id },
      orderBy: { createdAt: "desc" },
    });
    return rules.map(serializeRule);
  });

  app.post("/", async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    const r = await prisma.alertRule.create({
      data: {
        userId: req.currentUser!.id,
        symbol: parsed.data.symbol.toUpperCase(),
        conditionType: parsed.data.condition_type,
        direction: parsed.data.direction,
        threshold: parsed.data.threshold,
        cooldownSeconds: parsed.data.cooldown_seconds ?? 3600,
        notifyViaWs: parsed.data.notify_via_ws ?? true,
        notifyViaEmail: parsed.data.notify_via_email ?? false,
        reRunAnalysis: parsed.data.re_run_analysis ?? false,
      },
    });
    return reply.code(201).send(serializeRule(r));
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    const id = Number(req.params.id);
    const existing = await prisma.alertRule.findFirst({
      where: { id, userId: req.currentUser!.id },
    });
    if (!existing) return reply.code(404).send({ detail: "Not found" });
    const r = await prisma.alertRule.update({
      where: { id },
      data: {
        symbol: parsed.data.symbol?.toUpperCase(),
        conditionType: parsed.data.condition_type,
        direction: parsed.data.direction,
        threshold: parsed.data.threshold,
        cooldownSeconds: parsed.data.cooldown_seconds,
        notifyViaWs: parsed.data.notify_via_ws,
        notifyViaEmail: parsed.data.notify_via_email,
        reRunAnalysis: parsed.data.re_run_analysis,
        isActive: parsed.data.is_active,
      },
    });
    return serializeRule(r);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const existing = await prisma.alertRule.findFirst({
      where: { id, userId: req.currentUser!.id },
    });
    if (!existing) return reply.code(404).send({ detail: "Not found" });
    await prisma.alertRule.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get<{ Querystring: { limit?: string } }>("/events", async (req) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const events = await prisma.alertEvent.findMany({
      where: { userId: req.currentUser!.id },
      orderBy: { firedAt: "desc" },
      take: limit,
    });
    return events.map((e) => ({
      id: e.id,
      rule_id: e.ruleId,
      symbol: e.symbol,
      price_at_fire: e.priceAtFire,
      change_pct_at_fire: e.changePctAtFire,
      message: e.message,
      fired_at: e.firedAt.toISOString(),
    }));
  });
}
