/**
 * Background price producer.
 *
 *   Every PRODUCER_INTERVAL_SEC the producer:
 *     1. Collects the union of:
 *        - every watchlist symbol across all users
 *        - every symbol currently being WS-subscribed
 *        - every symbol that's the target of an ACTIVE alert rule
 *       (the last one matters: a rule whose symbol isn't watched would
 *        otherwise sit dormant forever — never get a tick, never fire)
 *     2. Fetches live quotes (parallel, cached 30 s).
 *     3. XADDs each quote onto `stream:prices`.
 *     4. Fans out to WebSocket clients via the hub.
 *     5. Lets alert evaluator (same process) react.
 *
 * The Redis stream gives us at-least-once delivery and a replay buffer; the
 * direct hub broadcast keeps latency low for the typical happy path.
 */
import { redis } from "../lib/cache.js";
import { prisma } from "../db.js";
import * as market from "./market.js";
import { broadcastPrice, watchedSymbols } from "./hub.js";
import { evaluateAlerts } from "./alertEvaluator.js";

const STREAM = "stream:prices";
const INTERVAL_MS = 15_000;
const STREAM_MAXLEN = 10_000;

let started = false;

async function tickOnce() {
  // 1) every distinct symbol on any user's watchlist
  // 2) every symbol that's the target of an ACTIVE alert rule (so alerts
  //    fire even when the user forgot to add the symbol to their watchlist)
  // 3) every symbol any live WS client has subscribed to
  const [watchlistRows, alertRows] = await Promise.all([
    prisma.watchlistItem.findMany({ select: { symbol: true }, distinct: ["symbol"] }),
    prisma.alertRule.findMany({
      where: { isActive: true },
      select: { symbol: true },
      distinct: ["symbol"],
    }),
  ]);
  const all = new Set<string>([
    ...watchlistRows.map((r) => r.symbol),
    ...alertRows.map((r) => r.symbol),
    ...watchedSymbols(),
  ]);
  if (!all.size) return;

  const quotes = await market.getQuotesBatch(Array.from(all));
  for (const q of quotes) {
    const payload = {
      symbol: q.symbol,
      price: q.price,
      change: q.change,
      change_percent: q.change_percent,
      previous_close: q.previous_close,
      currency: q.currency,
      timestamp: q.timestamp,
    };
    try {
      await redis.xadd(STREAM, "MAXLEN", "~", String(STREAM_MAXLEN), "*", "data", JSON.stringify(payload));
    } catch {
      /* swallow — broadcasting still works */
    }
    broadcastPrice(q.symbol, payload);
    void evaluateAlerts(payload);
  }
}

export function startProducer(): void {
  if (started) return;
  started = true;
  // immediate first tick, then interval
  void tickOnce();
  setInterval(() => {
    void tickOnce().catch(() => undefined);
  }, INTERVAL_MS);
}
