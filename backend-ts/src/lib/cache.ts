/**
 * Minimal JSON cache over Redis.
 *
 * Tiny on purpose: we only need get/set with TTL and a "remember"
 * convenience for the wrap-call-store pattern the market service uses.
 */
import Redis from "ioredis";
import { config } from "../config.js";

export const redis = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
  // Upstash (and most managed Redis) require TLS; ioredis enables it when `tls`
  // is any non-null object. Empty object is fine.
  tls: config.REDIS_TLS ? {} : undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});

let connecting: Promise<void> | null = null;
async function ensureConnected() {
  if (redis.status === "ready") return;
  if (!connecting) connecting = redis.connect().catch(() => undefined).then(() => undefined);
  await connecting;
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    await ensureConnected();
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // cache miss on any error — never fail the caller
  }
}

export async function setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await ensureConnected();
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // best-effort cache write
  }
}

export async function remember<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await getJson<T>(key);
  if (cached !== null) return cached;
  const fresh = await loader();
  await setJson(key, fresh, ttlSeconds);
  return fresh;
}
