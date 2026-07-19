/**
 * Public market data routes.
 *
 *   GET /stocks/:symbol/quote
 *   GET /stocks/:symbol/history?interval=1d&range=1mo
 *   GET /stocks/:symbol/profile
 */
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { InvalidSymbolError, validateSymbol } from "../lib/symbol.js";
import * as market from "../services/market.js";
import { prisma } from "../db.js";

function serializeStock(s: {
  symbol: string;
  baseSymbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  isin: string | null;
  currency: string | null;
  country: string | null;
  marketCap: bigint | null;
}) {
  return {
    symbol: s.symbol,
    base_symbol: s.baseSymbol,
    name: s.name,
    exchange: s.exchange,
    sector: s.sector,
    industry: s.industry,
    isin: s.isin,
    currency: s.currency,
    country: s.country,
    market_cap: s.marketCap !== null ? Number(s.marketCap) : null,
  };
}

export default async function stocksRoutes(app: FastifyInstance) {
  // -------------------- universal search --------------------
  // GET /stocks/search?q=tcs&limit=20&exchange=NSE
  // Matches:
  //   - exact symbol      (TCS.NS, TCS, 500325)
  //   - prefix symbol     (TC*)
  //   - prefix company    (Tata*)
  //   - contains company  (*tata consultancy*)
  // Ranked: exact > base_symbol prefix > name prefix > name contains.
  app.get<{
    Querystring: { q?: string; limit?: string; exchange?: string };
  }>("/search", async (req, reply) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return reply.code(422).send({ detail: "q is required" });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const exchange = req.query.exchange?.toUpperCase();

    const qUpper = q.toUpperCase();
    const qLower = q.toLowerCase();
    const baseWhere: Prisma.StockWhereInput = {
      isActive: true,
      ...(exchange ? { exchange } : {}),
    };

    // Pull a generous candidate set, then rank in JS to keep SQL simple.
    const candidates = await prisma.stock.findMany({
      where: {
        ...baseWhere,
        OR: [
          { symbol: { equals: qUpper } },
          { baseSymbol: { equals: qUpper } },
          { isin: { equals: qUpper } },
          { baseSymbol: { startsWith: qUpper } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit * 5,
    });

    const ranked = candidates
      .map((s) => {
        let score = 0;
        const sym = s.baseSymbol.toUpperCase();
        const name = s.name.toLowerCase();
        if (s.symbol.toUpperCase() === qUpper || sym === qUpper) score = 100;
        else if (s.isin && s.isin.toUpperCase() === qUpper) score = 95;
        else if (sym.startsWith(qUpper)) score = 80;
        else if (name === qLower) score = 75;
        else if (name.startsWith(qLower)) score = 60;
        else if (name.includes(qLower)) score = 40;
        // tiny boost for higher-cap names so big companies float to the top
        if (s.marketCap) score += Math.min(5, Math.log10(Number(s.marketCap)) - 8);
        return { s, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => serializeStock(r.s));

    return ranked;
  });

  // GET /stocks/popular  — top-by-market-cap list for the landing page.
  app.get<{ Querystring: { exchange?: string; limit?: string } }>(
    "/popular",
    async (req) => {
      const exchange = req.query.exchange?.toUpperCase();
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
      const rows = await prisma.stock.findMany({
        where: {
          isActive: true,
          ...(exchange ? { exchange } : {}),
          marketCap: { not: null },
        },
        orderBy: { marketCap: "desc" },
        take: limit,
      });
      return rows.map(serializeStock);
    },
  );

  // GET /stocks/:symbol  — single stock metadata (NOT the live quote)
  app.get<{ Params: { symbol: string } }>("/lookup/:symbol", async (req, reply) => {
    const symRaw = req.params.symbol.toUpperCase();
    const row = await prisma.stock.findFirst({
      where: {
        OR: [{ symbol: symRaw }, { baseSymbol: symRaw }, { isin: symRaw }],
      },
    });
    if (!row) return reply.code(404).send({ detail: "Stock not found" });
    return serializeStock(row);
  });


  app.get<{ Params: { symbol: string } }>("/:symbol/quote", async (req, reply) => {
    try {
      return await market.getQuote(validateSymbol(req.params.symbol));
    } catch (e) {
      if (e instanceof InvalidSymbolError) return reply.code(422).send({ detail: e.message });
      app.log.error(e);
      return reply.code(502).send({ detail: `Upstream quote provider failed: ${(e as Error).message}` });
    }
  });

  app.get<{
    Params: { symbol: string };
    Querystring: { interval?: string; range?: string };
  }>("/:symbol/history", async (req, reply) => {
    try {
      const symbol = validateSymbol(req.params.symbol);
      const { interval = "1d", range = "1mo" } = req.query;
      return await market.getHistory(symbol, interval, range);
    } catch (e) {
      if (e instanceof InvalidSymbolError) return reply.code(422).send({ detail: e.message });
      app.log.error(e);
      return reply.code(502).send({ detail: "Upstream history provider failed" });
    }
  });

  app.get<{ Params: { symbol: string } }>("/:symbol/profile", async (req, reply) => {
    try {
      return await market.getProfile(validateSymbol(req.params.symbol));
    } catch (e) {
      if (e instanceof InvalidSymbolError) return reply.code(422).send({ detail: e.message });
      app.log.error(e);
      return reply.code(502).send({ detail: "Upstream profile provider failed" });
    }
  });

  // GET /stocks/compare?symbols=TCS.NS,INFY.NS,... — peer metrics side-by-side.
  app.get<{ Querystring: { symbols?: string } }>("/compare", async (req, reply) => {
    const list = (req.query.symbols ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!list.length) return reply.code(422).send({ detail: "symbols is required" });
    try {
      const valid = list.map((s) => validateSymbol(s));
      return await market.comparePeers(valid);
    } catch (e) {
      if (e instanceof InvalidSymbolError) return reply.code(422).send({ detail: e.message });
      app.log.error(e);
      return reply.code(502).send({ detail: "Peer comparison provider failed" });
    }
  });

  // GET /stocks/:symbol/fundamentals — ratios, statements, analyst, holdings.
  app.get<{ Params: { symbol: string } }>("/:symbol/fundamentals", async (req, reply) => {
    try {
      return await market.getFundamentals(validateSymbol(req.params.symbol));
    } catch (e) {
      if (e instanceof InvalidSymbolError) return reply.code(422).send({ detail: e.message });
      app.log.error(e);
      return reply.code(502).send({ detail: "Upstream fundamentals provider failed" });
    }
  });

  // GET /stocks/:symbol/market-status — open/closed/pre/post for live-update gating.
  app.get<{ Params: { symbol: string } }>("/:symbol/market-status", async (req, reply) => {
    try {
      return await market.getMarketStatus(validateSymbol(req.params.symbol));
    } catch (e) {
      if (e instanceof InvalidSymbolError) return reply.code(422).send({ detail: e.message });
      app.log.error(e);
      return reply.code(502).send({ detail: "Upstream market-status provider failed" });
    }
  });

  // GET /stocks/:symbol/corporate-actions?range=5y — dividends / splits / earnings markers.
  app.get<{
    Params: { symbol: string };
    Querystring: { range?: string };
  }>("/:symbol/corporate-actions", async (req, reply) => {
    try {
      return await market.getCorporateActions(
        validateSymbol(req.params.symbol),
        req.query.range ?? "5y",
      );
    } catch (e) {
      if (e instanceof InvalidSymbolError) return reply.code(422).send({ detail: e.message });
      app.log.error(e);
      return reply.code(502).send({ detail: "Upstream corporate-actions provider failed" });
    }
  });
}
