/**
 * Liveness + readiness routes.
 *
 *   GET /health   — process is up (no dependencies checked)
 *   GET /ready    — postgres + redis are reachable
 *
 * Mirrors the Python backend so the frontend and any uptime probe keep working.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { redis } from "../lib/cache.js";

export default async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok",
    app: config.APP_NAME,
    env: config.APP_ENV,
    llm_provider: config.LLM_PROVIDER,
  }));

  app.get("/ready", async (_req, reply) => {
    const components: Record<string, string> = {};

    try {
      await prisma.$queryRaw`SELECT 1`;
      components.postgres = "ok";
    } catch (e) {
      components.postgres = `error: ${(e as Error).message}`;
    }

    try {
      if (redis.status === "wait" || redis.status === "end") {
        await redis.connect().catch(() => undefined);
      }
      await redis.ping();
      components.redis = "ok";
    } catch (e) {
      components.redis = `error: ${(e as Error).message}`;
    }

    const ready = Object.values(components).every((v) => v === "ok");
    return reply.status(ready ? 200 : 503).send({
      status: ready ? "ready" : "degraded",
      components,
    });
  });
}
