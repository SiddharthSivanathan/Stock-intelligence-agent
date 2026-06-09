/**
 * Background price producer.
 *
 *   Every PRODUCER_INTERVAL_SEC the producer:
 *     1. Collects the union of every watchlist symbol across all users
 *        AND every symbol currently being WS-subscribed.
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
  // union of watchlist symbols and any live-subscribed symbol
  const dbSyms = (
    await prisma.watchlistItem.findMany({ select: { symbol: true }, distinct: ["symbol"] })
  ).map((r) => r.symbol);
  const all = new Set<string>([...dbSyms, ...watchedSymbols()]);
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
