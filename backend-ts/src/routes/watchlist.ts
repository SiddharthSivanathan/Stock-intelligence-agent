/**
 * Watchlist endpoints — all require auth.
 *
 *   GET    /watchlist          list user's symbols
 *   GET    /watchlist/quotes   live quotes for every symbol on the list (parallel)
 *   POST   /watchlist          { symbol, notes? }
 *   DELETE /watchlist/:symbol  remove one
 *
 * /quotes is declared before /:symbol so route matching doesn't shadow it.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { InvalidSymbolError, validateSymbol } from "../lib/symbol.js";
import * as market from "../services/market.js";

const addSchema = z.object({
  symbol: z.string().min(1).max(20),
  notes: z.string().max(500).optional().nullable(),
});

function serialize(it: {
  id: number;
  symbol: string;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: it.id,
    symbol: it.symbol,
    notes: it.notes,
    created_at: it.createdAt.toISOString(),
  };
}

export default async function watchlistRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/quotes", async (req) => {
    const items = await prisma.watchlistItem.findMany({
      where: { userId: req.currentUser!.id },
      orderBy: { id: "asc" },
    });
    return market.getQuotesBatch(items.map((it) => it.symbol));
  });

  app.get("/", async (req) => {
    const items = await prisma.watchlistItem.findMany({
      where: { userId: req.currentUser!.id },
      orderBy: { id: "asc" },
    });
    return items.map(serialize);
  });

  app.post("/", async (req, reply) => {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ detail: parsed.error.flatten() });

    let symbol: string;
    try {
      symbol = validateSymbol(parsed.data.symbol);
    } catch (e) {
      if (e instanceof InvalidSymbolError) return reply.code(422).send({ detail: e.message });
      throw e;
    }

    try {
      const item = await prisma.watchlistItem.create({
        data: {
          userId: req.currentUser!.id,
          symbol,
          notes: parsed.data.notes ?? null,
        },
      });
      return reply.code(201).send(serialize(item));
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "P2002") {
        return reply.code(409).send({ detail: `${symbol} is already on your watchlist` });
      }
      throw e;
    }
  });

  app.delete<{ Params: { symbol: string } }>("/:symbol", async (req, reply) => {
    let symbol: string;
    try {
      symbol = validateSymbol(req.params.symbol);
    } catch (e) {
      if (e instanceof InvalidSymbolError) return reply.code(422).send({ detail: e.message });
      throw e;
    }
    const result = await prisma.watchlistItem.deleteMany({
      where: { userId: req.currentUser!.id, symbol },
    });
    if (result.count === 0) {
      return reply.code(404).send({ detail: `${symbol} is not on your watchlist` });
    }
    return reply.code(204).send();
  });
}
