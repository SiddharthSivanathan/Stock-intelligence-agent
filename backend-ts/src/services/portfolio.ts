/**
 * Paper-trading portfolio service.
 *
 *   - 1 portfolio per user, $100k starting cash.
 *   - buy: deducts cash, adjusts (qty, avg_cost) atomically.
 *   - sell: adds cash, reduces qty; closes position when qty hits 0.
 *   - snapshot: prices every position with the live quote service.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import * as market from "./market.js";

const STARTING_CASH = 100_000;

async function getOrCreatePortfolio(userId: number) {
  return prisma.portfolio.upsert({
    where: { userId },
    update: {},
    create: { userId, startingCash: STARTING_CASH, cash: STARTING_CASH },
  });
}

export async function reset(userId: number) {
  await prisma.$transaction(async (tx) => {
    const pf = await tx.portfolio.findUnique({ where: { userId } });
    if (pf) {
      await tx.trade.deleteMany({ where: { portfolioId: pf.id } });
      await tx.position.deleteMany({ where: { portfolioId: pf.id } });
      await tx.portfolio.update({
        where: { id: pf.id },
        data: { cash: STARTING_CASH, startingCash: STARTING_CASH },
      });
    }
  });
  return getOrCreatePortfolio(userId);
}

export interface TradeInput {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
}

export async function trade(userId: number, input: TradeInput) {
  const symbol = input.symbol.toUpperCase();
  const quote = await market.getQuote(symbol);
  const price = quote.price;
  if (!price || price <= 0) throw new Error("Could not price symbol");

  const value = input.qty * price;

  return prisma.$transaction(async (tx) => {
    const pf = await tx.portfolio.upsert({
      where: { userId },
      update: {},
      create: { userId, startingCash: STARTING_CASH, cash: STARTING_CASH },
    });

    const existing = await tx.position.findUnique({
      where: { portfolioId_symbol: { portfolioId: pf.id, symbol } },
    });

    if (input.side === "buy") {
      if (pf.cash < value) throw new Error("Insufficient cash");
      const newQty = (existing?.qty ?? 0) + input.qty;
      const newAvg =
        existing && existing.qty > 0
          ? (existing.avgCost * existing.qty + price * input.qty) / newQty
          : price;
      await tx.position.upsert({
        where: { portfolioId_symbol: { portfolioId: pf.id, symbol } },
        update: { qty: newQty, avgCost: newAvg },
        create: { portfolioId: pf.id, symbol, qty: input.qty, avgCost: price },
      });
      await tx.portfolio.update({ where: { id: pf.id }, data: { cash: pf.cash - value } });
    } else {
      if (!existing || existing.qty < input.qty) throw new Error("Insufficient shares");
      const newQty = existing.qty - input.qty;
      if (newQty <= 0) {
        await tx.position.delete({ where: { id: existing.id } });
      } else {
        await tx.position.update({ where: { id: existing.id }, data: { qty: newQty } });
      }
      await tx.portfolio.update({ where: { id: pf.id }, data: { cash: pf.cash + value } });
    }

    return tx.trade.create({
      data: {
        portfolioId: pf.id,
        symbol,
        side: input.side,
        qty: input.qty,
        price,
        value,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function snapshot(userId: number) {
  const pf = await getOrCreatePortfolio(userId);
  const positions = await prisma.position.findMany({ where: { portfolioId: pf.id } });
  const quotes = await market.getQuotesBatch(positions.map((p) => p.symbol));
  const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));

  let holdingsValue = 0;
  let costBasis = 0;
  const enriched = positions.map((p) => {
    const price = priceMap.get(p.symbol) ?? p.avgCost;
    const marketValue = price * p.qty;
    const cost = p.avgCost * p.qty;
    const pnl = marketValue - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    holdingsValue += marketValue;
    costBasis += cost;
    return {
      symbol: p.symbol,
      qty: p.qty,
      avg_cost: p.avgCost,
      price,
      market_value: marketValue,
      pnl,
      pnl_pct: pnlPct,
    };
  });

  const totalValue = pf.cash + holdingsValue;
  const totalPnl = totalValue - pf.startingCash;
  return {
    portfolio_id: pf.id,
    starting_cash: pf.startingCash,
    cash: pf.cash,
    holdings_value: holdingsValue,
    total_value: totalValue,
    total_pnl: totalPnl,
    total_pnl_pct: pf.startingCash ? (totalPnl / pf.startingCash) * 100 : 0,
    positions: enriched,
  };
}

export async function trades(userId: number, limit = 100) {
  const pf = await getOrCreatePortfolio(userId);
  return prisma.trade.findMany({
    where: { portfolioId: pf.id },
    orderBy: { executedAt: "desc" },
    take: limit,
  });
}
