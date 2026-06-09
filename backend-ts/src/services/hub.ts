/**
 * In-process WebSocket hub.
 *
 * Tracks { userId, ws, subscriptions } for every connected client and exposes
 * fan-out helpers used by the price broadcaster and alert evaluator.
 *
 * One Node process only — fine for a single-replica deploy. A horizontal
 * scale-out would replace this with a Redis pub/sub fanout.
 */
import type { WebSocket } from "ws";

interface Client {
  ws: WebSocket;
  userId: number;
  subscriptions: Set<string>;
}

const clients = new Set<Client>();

export function register(ws: WebSocket, userId: number, initialSubs: string[] = []): Client {
  const client: Client = { ws, userId, subscriptions: new Set(initialSubs) };
  clients.add(client);
  ws.on("close", () => clients.delete(client));
  return client;
}

export function subscribe(client: Client, symbols: string[]) {
  for (const s of symbols) client.subscriptions.add(s.toUpperCase());
}
export function unsubscribe(client: Client, symbols: string[]) {
  for (const s of symbols) client.subscriptions.delete(s.toUpperCase());
}

function safeSend(ws: WebSocket, payload: string) {
  try {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  } catch {
    /* ignore — close handler will clean up */
  }
}

export function broadcastPrice(symbol: string, payload: Record<string, unknown>) {
  const msg = JSON.stringify({ type: "price", data: payload });
  const sym = symbol.toUpperCase();
  for (const c of clients) if (c.subscriptions.has(sym)) safeSend(c.ws, msg);
}

export function sendAlert(userId: number, payload: Record<string, unknown>) {
  const msg = JSON.stringify({ type: "alert", data: payload });
  for (const c of clients) if (c.userId === userId) safeSend(c.ws, msg);
}

/** Union of symbols subscribed by ANY client — used by the price producer. */
export function watchedSymbols(): string[] {
  const all = new Set<string>();
  for (const c of clients) for (const s of c.subscriptions) all.add(s);
  return Array.from(all);
}
