/**
 * Centralised, validated runtime configuration.
 *
 * Read once at process startup. Crash early if anything required is missing or
 * malformed — the rest of the app then treats `config` as a typed constant.
 */
import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

const jsonArray = z
  .string()
  .transform((s, ctx) => {
    try {
      const parsed = JSON.parse(s);
      if (!Array.isArray(parsed)) throw new Error("not array");
      return parsed as string[];
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a JSON array of strings" });
      return z.NEVER;
    }
  });

const schema = z.object({
  APP_ENV: z.enum(["dev", "prod", "test"]).default("dev"),
  APP_NAME: z.string().default("Stock Intelligence System"),
  API_PREFIX: z.string().default("/api/v1"),
  PORT: z.coerce.number().int().default(8000),
  CORS_ORIGINS: jsonArray.default('["http://localhost:5173"]'),

  DATABASE_URL: z.string().url(),

  REDIS_HOST: z.string().default("redis"),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional(),       // Upstash / managed Redis needs auth
  REDIS_TLS: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "string" ? v.toLowerCase() === "true" : v))
    .default(false),                            // Upstash requires TLS in prod

  CHROMA_HOST: z.string().default("chroma"),
  CHROMA_PORT: z.coerce.number().int().default(8000),
  CHROMA_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "string" ? v.toLowerCase() === "true" : v))
    .default(true),                             // Set to false on serverless deploys without Chroma

  // Disable the price producer + alert evaluator background loops on platforms
  // that sleep between requests (Render free, Vercel Functions, etc.).
  DISABLE_BACKGROUND_WORKERS: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "string" ? v.toLowerCase() === "true" : v))
    .default(false),

  LLM_PROVIDER: z.enum(["gemini", "openai", "ollama"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OLLAMA_BASE_URL: z.string().default("http://host.docker.internal:11434"),
  OLLAMA_MODEL: z.string().default("llama3"),

  EMBEDDING_MODEL: z.string().default("Xenova/bge-small-en-v1.5"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ALGORITHM: z.literal("HS256").default("HS256"),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().default(30),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),

  FINNHUB_API_KEY: z.string().optional(),
  NEWSAPI_KEY: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_USE_TLS: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "string" ? v.toLowerCase() === "true" : v))
    .default(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// In prod, refuse to boot with the default placeholder secret.
if (
  parsed.data.APP_ENV === "prod" &&
  /change-me/i.test(parsed.data.JWT_SECRET)
) {
  console.error("JWT_SECRET is still the placeholder. Refusing to start in prod.");
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
