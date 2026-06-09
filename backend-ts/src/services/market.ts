/**
 * Market data service.
 *
 * Primary source: yahoo-finance2 (no key needed). Quotes cached 30s,
 * history cached 5 min, profiles cached 1 day. Finnhub is an optional
 * fallback for quotes if FINNHUB_API_KEY is set and yahoo throws.
 */
import axios from "axios";
import { remember } from "../lib/cache.js";
import { config } from "../config.js";
import { quoteSummary, rawOf } from "./yahooDirect.js";

// v2.11.x ships the default export as a ready-to-use instance with all modules
// (quote, chart, historical, quoteSummary, etc.). v2.13+ dropped most modules
// from the ESM build, so we pin to 2.11.3 in package.json.
// (No suppressNotices — the survey banner prints to stderr once and is harmless.)

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previous_close: number | null;
  volume: number | null;
  timestamp: string; // ISO
  source: string;
  currency: string | null;
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  country: string | null;
  currency: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
}

// ---------- Quote ----------

async function quoteFromYahoo(symbol: string): Promise<Quote> {
  // Direct call with browser UA — bypasses Yahoo's anti-bot crumb-fetch
  // rate-limit that breaks yahoo-finance2 from container IPs.
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const { data } = await axios.get(url, {
    params: { interval: "1d", range: "5d" },
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    timeout: 30_000,
  });
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error("yahoo: empty chart result");
  const meta = r.meta ?? {};
  const price = (meta.regularMarketPrice ?? 0) as number;
  const prev = (meta.previousClose ?? meta.chartPreviousClose ?? null) as number | null;
  const change = prev != null ? price - prev : 0;
  const changePct = prev ? (change / prev) * 100 : 0;
  return {
    symbol,
    price,
    change,
    change_percent: changePct,
    open: (meta.regularMarketOpen ?? null) as number | null,
    high: (meta.regularMarketDayHigh ?? null) as number | null,
    low: (meta.regularMarketDayLow ?? null) as number | null,
    previous_close: prev,
    volume: (meta.regularMarketVolume ?? null) as number | null,
    timestamp: new Date().toISOString(),
    source: "yfinance",
    currency: (meta.currency ?? null) as string | null,
  };
}

async function quoteFromFinnhub(symbol: string): Promise<Quote> {
  if (!config.FINNHUB_API_KEY) throw new Error("FINNHUB_API_KEY not set");
  const url = "https://finnhub.io/api/v1/quote";
  const { data } = await axios.get(url, {
    params: { symbol, token: config.FINNHUB_API_KEY },
    timeout: 30_000,
  });
  const price = data.c;
  const prev = data.pc;
  return {
    symbol,
    price,
    change: price - prev,
    change_percent: prev ? ((price - prev) / prev) * 100 : 0,
    open: data.o ?? null,
    high: data.h ?? null,
    low: data.l ?? null,
    previous_close: prev ?? null,
    volume: null,
    timestamp: new Date(((data.t as number) || Date.now() / 1000) * 1000).toISOString(),
    source: "finnhub",
    currency: "USD",
  };
}

export async function getQuote(symbol: string): Promise<Quote> {
  return remember(`quote:${symbol}`, 30, async () => {
    try {
      return await quoteFromYahoo(symbol);
    } catch (yahooErr) {
      if (!config.FINNHUB_API_KEY) throw yahooErr;
      try {
        return await quoteFromFinnhub(symbol);
      } catch (finnhubErr) {
        // Surface both — usually one is the real cause, the other is incidental.
        const ym = (yahooErr as Error).message;
        const fm = (finnhubErr as Error).message;
        throw new Error(`yahoo: ${ym} | finnhub: ${fm}`);
      }
    }
  });
}

export async function getQuotesBatch(symbols: string[]): Promise<Quote[]> {
  const results = await Promise.allSettled(symbols.map(getQuote));
  return results
    .filter((r): r is PromiseFulfilledResult<Quote> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---------- History ----------

const PERIOD_TO_SECONDS: Record<string, number> = {
  "1d": 86400,
  "5d": 5 * 86400,
  "1mo": 30 * 86400,
  "3mo": 90 * 86400,
  "6mo": 180 * 86400,
  "1y": 365 * 86400,
  "2y": 730 * 86400,
  "5y": 5 * 365 * 86400,
  ytd: Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 1000,
  ),
  max: 20 * 365 * 86400,
};

// A real browser User-Agent. yahoo-finance2 sends a bot-like UA that Yahoo
// 429s aggressively from container IPs; calling the endpoint directly with a
// browser UA bypasses the rate limiter entirely.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function historyFromYahoo(
  symbol: string,
  interval: string,
  range: string,
): Promise<Candle[]> {
  const period1 = Math.floor(Date.now() / 1000) - (PERIOD_TO_SECONDS[range] ?? 30 * 86400);
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const { data } = await axios.get(url, {
    params: { interval, period1, period2, includePrePost: false },
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    timeout: 30_000,
  });
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps: number[] = result.timestamp ?? [];
  const ohlc = result.indicators?.quote?.[0] ?? {};
  const out: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = ohlc.close?.[i];
    if (close == null) continue;
    out.push({
      timestamp: new Date(timestamps[i] * 1000).toISOString(),
      open: ohlc.open?.[i] ?? close,
      high: ohlc.high?.[i] ?? close,
      low: ohlc.low?.[i] ?? close,
      close,
      volume: ohlc.volume?.[i] ?? 0,
    });
  }
  return out;
}

/**
 * Stooq daily history — free CSV, no auth, no key rate limit.
 *
 * Symbol mapping:
 *   US stocks   → lowercase + ".us"     (AAPL → aapl.us)
 *   NSE India   → lowercase + ".in"     (no leading ^)
 *   Indices     → ^GSPC → ^spx, ^DJI → ^dji, ^NSEI → ^nse, ^IXIC → ^ndq
 *   FX / crypto → not handled here
 */
function toStooqSymbol(symbol: string): string {
  const s = symbol.trim();
  if (s.startsWith("^")) {
    const map: Record<string, string> = {
      "^GSPC": "^spx",
      "^DJI": "^dji",
      "^IXIC": "^ndq",
      "^NSEI": "^nse",
      "^BSESN": "^sns",
      "^FTSE": "^ftm",
    };
    return map[s] ?? s.toLowerCase();
  }
  if (s.includes(".")) return s.toLowerCase(); // RELIANCE.NS → reliance.ns
  return `${s.toLowerCase()}.us`;
}

async function historyFromStooq(symbol: string, range: string): Promise<Candle[]> {
  const days = Math.ceil((PERIOD_TO_SECONDS[range] ?? 30 * 86400) / 86400);
  const stooqSym = toStooqSymbol(symbol);
  const { data } = await axios.get<string>(
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`,
    {
      responseType: "text",
      timeout: 30_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/csv,*/*",
      },
    },
  );
  // If Stooq returned HTML (anti-bot challenge), treat as empty.
  if (data.trim().startsWith("<")) return [];
  // CSV header: Date,Open,High,Low,Close,Volume
  const lines = data.trim().split("\n").slice(1); // drop header
  if (!lines.length || lines[0].toLowerCase().includes("no data")) return [];
  const all: Candle[] = [];
  for (const line of lines) {
    const [d, o, h, l, c, v] = line.split(",");
    const close = Number(c);
    if (!d || !Number.isFinite(close)) continue;
    all.push({
      timestamp: new Date(`${d}T00:00:00Z`).toISOString(),
      open: Number(o) || close,
      high: Number(h) || close,
      low: Number(l) || close,
      close,
      volume: Number(v) || 0,
    });
  }
  // Stooq returns oldest-first; keep last N days.
  return all.slice(-days);
}

/** Last-ditch: synthesise a single bar from the current quote. */
async function historyFromQuoteFallback(symbol: string): Promise<Candle[]> {
  const q = await getQuote(symbol);
  return [
    {
      timestamp: q.timestamp,
      open: q.open ?? q.price,
      high: q.high ?? q.price,
      low: q.low ?? q.price,
      close: q.price,
      volume: q.volume ?? 0,
    },
  ];
}

export async function getHistory(
  symbol: string,
  interval = "1d",
  range = "1mo",
): Promise<Candle[]> {
  return remember(`history:${symbol}:${interval}:${range}`, 5 * 60, async () => {
    // 1) Yahoo (chart → historical fallback inside)
    try {
      const bars = await historyFromYahoo(symbol, interval, range);
      if (bars.length) return bars;
    } catch {
      /* try next provider */
    }
    // 2) Stooq — free CSV, no auth, ~daily bars only
    try {
      const bars = await historyFromStooq(symbol, range);
      if (bars.length) return bars;
    } catch {
      /* try next provider */
    }
    // 3) Single most-recent bar from the live quote (better than empty chart)
    return historyFromQuoteFallback(symbol);
  });
}

// ---------- Profile ----------

async function profileFromYahoo(symbol: string): Promise<CompanyProfile> {
  const result = await quoteSummary(symbol, [
    "assetProfile",
    "price",
    "summaryProfile",
  ]);
  if (!result || Object.keys(result).length === 0) {
    throw new Error("yahoo: empty quoteSummary");
  }
  const p = (result.price ?? {}) as Record<string, unknown>;
  const ap = (result.assetProfile ?? result.summaryProfile ?? {}) as Record<string, unknown>;
  const marketCap = rawOf(p.marketCap);
  return {
    symbol,
    name: (p.longName ?? p.shortName ?? symbol) as string,
    sector: (ap.sector as string | undefined) ?? null,
    industry: (ap.industry as string | undefined) ?? null,
    market_cap: typeof marketCap === "number" ? marketCap : null,
    country: (ap.country as string | undefined) ?? null,
    currency: (p.currency as string | undefined) ?? null,
    website: (ap.website as string | undefined) ?? null,
    description: (ap.longBusinessSummary as string | undefined) ?? null,
    logo_url: null,
  };
}

async function profileFromFinnhub(symbol: string): Promise<CompanyProfile> {
  if (!config.FINNHUB_API_KEY) throw new Error("FINNHUB_API_KEY not set");
  const { data } = await axios.get("https://finnhub.io/api/v1/stock/profile2", {
    params: { symbol, token: config.FINNHUB_API_KEY },
    timeout: 30_000,
  });
  return {
    symbol,
    name: data.name ?? symbol,
    sector: data.finnhubIndustry ?? null,
    industry: data.finnhubIndustry ?? null,
    market_cap: data.marketCapitalization ? Math.round(data.marketCapitalization * 1e6) : null,
    country: data.country ?? null,
    currency: data.currency ?? null,
    website: data.weburl ?? null,
    description: null,
    logo_url: data.logo ?? null,
  };
}

/**
 * Last-ditch fallback: build a minimal CompanyProfile from our `stocks` master.
 *
 * Yahoo's crumb handshake silently fails from some IP ranges (Render free tier
 * is one of them) and Finnhub free tier doesn't track Indian `.NS` symbols.
 * The stocks master always has at least the name + exchange + currency, which
 * is enough for the Profile panel to show *something* instead of "No data".
 */
async function profileFromMaster(symbol: string): Promise<CompanyProfile> {
  const { prisma } = await import("../db.js");
  const upper = symbol.toUpperCase();
  const row = await prisma.stock.findFirst({
    where: {
      OR: [{ symbol: upper }, { baseSymbol: upper }],
    },
  });
  if (!row) {
    // Nothing in the master either — return a stub so the UI doesn't break.
    return {
      symbol,
      name: symbol,
      sector: null,
      industry: null,
      market_cap: null,
      country: null,
      currency: null,
      website: null,
      description: null,
      logo_url: null,
    };
  }
  return {
    symbol,
    name: row.name,
    sector: row.sector,
    industry: row.industry,
    market_cap: row.marketCap !== null ? Number(row.marketCap) : null,
    country: row.country,
    currency: row.currency,
    website: null,
    description: null,
    logo_url: null,
  };
}

export async function getProfile(symbol: string): Promise<CompanyProfile> {
  return remember(`profile:${symbol}`, 86_400, async () => {
    // 1. Yahoo (rich data) — fails silently on Render free tier sometimes
    try {
      return await profileFromYahoo(symbol);
    } catch {
      /* fall through */
    }
    // 2. Finnhub (US stocks only)
    if (config.FINNHUB_API_KEY) {
      try {
        return await profileFromFinnhub(symbol);
      } catch {
        /* fall through */
      }
    }
    // 3. Stocks master (always works — built from NSE CSV during sync)
    return profileFromMaster(symbol);
  });
}
