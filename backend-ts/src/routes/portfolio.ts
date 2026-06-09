/**
 * Paper-trading portfolio endpoints — all require auth.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import * as pf from "../services/portfolio.js";

const tradeSchema = z.object({
  symbol: z.string().min(1).max(20),
  side: z.enum(["buy", "sell"]),
  qty: z.number().positive(),
});

export default async function portfolioRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (req) => pf.snapshot(req.currentUser!.id));

  app.post("/trade", async (req, reply) => {
    const parsed = tradeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });
    try {
      const t = await pf.trade(req.currentUser!.id, parsed.data);
      return reply.code(201).send({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        qty: t.qty,
        price: t.price,
        value: t.value,
        executed_at: t.executedAt.toISOString(),
      });
    } catch (e) {
      return reply.code(400).send({ detail: (e as Error).message });
    }
  });

  app.get<{ Querystring: { limit?: string } }>("/trades", async (req) => {
    const list = await pf.trades(req.currentUser!.id, Math.min(Number(req.query.limit) || 100, 500));
    return list.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      qty: t.qty,
      price: t.price,
      value: t.value,
      executed_at: t.executedAt.toISOString(),
    }));
  });

  app.post("/reset", async (req) => pf.reset(req.currentUser!.id));
}
