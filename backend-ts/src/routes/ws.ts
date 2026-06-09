/**
 * WebSocket hub endpoint.
 *
 *   GET ws://host/api/v1/ws?token=<access_jwt>
 *
 * Auto-subscribes the connected user to every symbol on their watchlist.
 * Client can subscribe/unsubscribe to additional symbols at any time:
 *   { action: "subscribe",   symbols: ["MSFT","TSLA"] }
 *   { action: "unsubscribe", symbols: ["TSLA"] }
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { decodeToken } from "../lib/security.js";
import {
  register,
  subscribe,
  unsubscribe,
} from "../services/hub.js";

export default async function wsRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string })?.token;
    if (!token) {
      socket.send(JSON.stringify({ type: "error", detail: "missing token" }));
      socket.close();
      return;
    }
    let userId: number;
    try {
      const claims = decodeToken(token);
      if (claims.type !== "access") throw new Error("not access token");
      userId = Number.parseInt(claims.sub, 10);
    } catch {
      socket.send(JSON.stringify({ type: "error", detail: "invalid token" }));
      socket.close();
      return;
    }

    // Auto-subscribe to the user's watchlist on connect.
    const items = await prisma.watchlistItem.findMany({ where: { userId } });
    const initial = items.map((it) => it.symbol);
    const client = register(socket as never, userId, initial);

    socket.send(
      JSON.stringify({ type: "connected", user_id: userId, subscriptions: initial }),
    );

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.action === "subscribe" && Array.isArray(msg.symbols)) {
          subscribe(client, msg.symbols);
          socket.send(
            JSON.stringify({ type: "subscribed", symbols: Array.from(client.subscriptions) }),
          );
        } else if (msg.action === "unsubscribe" && Array.isArray(msg.symbols)) {
          unsubscribe(client, msg.symbols);
          socket.send(
            JSON.stringify({ type: "unsubscribed", symbols: Array.from(client.subscriptions) }),
          );
        } else if (msg.action === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        /* ignore malformed client frame */
      }
    });
  });
}
