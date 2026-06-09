/**
 * Application entry — wires every route, starts the background price producer,
 * and serves under `/api/v1` so the existing React frontend works unchanged.
 */
import Fastify from "fastify";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";

import { config } from "./config.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import stocksRoutes from "./routes/stocks.js";
import watchlistRoutes from "./routes/watchlist.js";
import llmRoutes from "./routes/llm.js";
import ragRoutes from "./routes/rag.js";
import agentRoutes from "./routes/agents.js";
import insightRoutes from "./routes/insights.js";
import recommendationRoutes from "./routes/recommendations.js";
import alertRoutes from "./routes/alerts.js";
import portfolioRoutes from "./routes/portfolio.js";
import wsRoutes from "./routes/ws.js";
import { startProducer } from "./services/producer.js";

async function build() {
  const app = Fastify({
    logger: {
      transport:
        config.APP_ENV === "dev"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } }
          : undefined,
      level: config.APP_ENV === "dev" ? "info" : "warn",
    },
    trustProxy: true,
    bodyLimit: 25 * 1024 * 1024, // 25 MB for PDF uploads
    // Treat /alerts and /alerts/ as the same route. The frontend POSTs without
    // a trailing slash; without this flag Fastify 404s the mismatch.
    ignoreTrailingSlash: true,
  });

  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
  });
  await app.register(formbody);                 // OAuth2 password flow
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
  await app.register(websocket);

  app.get("/", async () => ({
    name: config.APP_NAME,
    env: config.APP_ENV,
    docs: `${config.API_PREFIX} (no OpenAPI in this port — see ../backend for spec)`,
  }));

  // Versioned surface — matches the Python backend route-for-route.
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { prefix: "/auth" });
      await api.register(stocksRoutes, { prefix: "/stocks" });
      await api.register(watchlistRoutes, { prefix: "/watchlist" });
      await api.register(llmRoutes, { prefix: "/llm" });
      await api.register(ragRoutes, { prefix: "/rag" });
      await api.register(agentRoutes, { prefix: "/agents" });
      await api.register(insightRoutes, { prefix: "/insights" });
      await api.register(recommendationRoutes, { prefix: "/recommendations" });
      await api.register(alertRoutes, { prefix: "/alerts" });
      await api.register(portfolioRoutes, { prefix: "/portfolio" });
      await api.register(wsRoutes);
    },
    { prefix: config.API_PREFIX },
  );

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    const status = err.statusCode ?? 500;
    reply.code(status).send({ detail: err.message || "Internal Server Error" });
  });

  return app;
}

async function main() {
  const app = await build();
  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    app.log.info(`${config.APP_NAME} listening on :${config.PORT} (${config.APP_ENV})`);
    // Background producer for /stream:prices + alert eval. Skipped on platforms
    // that sleep between requests (Render free, etc.) — those waste cycles.
    if (config.DISABLE_BACKGROUND_WORKERS) {
      app.log.warn("DISABLE_BACKGROUND_WORKERS=true — price producer + alert evaluator NOT started.");
    } else {
      startProducer();
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
