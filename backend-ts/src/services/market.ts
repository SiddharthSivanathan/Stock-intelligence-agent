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
  "3y": 3 * 365 * 86400,
  "5y": 5 * 365 * 86400,
  "10y": 10 * 365 * 86400,
  ytd: Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 1000,
  ),
  max: 30 * 365 * 86400,
};

// How to satisfy each UI interval. Yahoo natively supports
// 1m,2m,5m,15m,30m,60m,90m,1h,1d,5d,1wk,1mo,3mo — but NOT 3m,2h,4h, so those
// are fetched at a finer native interval and resampled server-side.
//   fetch  = the interval string sent to Yahoo
//   bucket = if set, resample the fetched bars into this bucket (seconds)
const INTERVAL_PLAN: Record<string, { fetch: string; bucket?: number }> = {
  "1m": { fetch: "1m" },
  "2m": { fetch: "2m" },
  "3m": { fetch: "1m", bucket: 180 },
  "5m": { fetch: "5m" },
  "15m": { fetch: "15m" },
  "30m": { fetch: "30m" },
  "60m": { fetch: "60m" },
  "1h": { fetch: "60m" },
  "2h": { fetch: "60m", bucket: 2 * 3600 },
  "4h": { fetch: "60m", bucket: 4 * 3600 },
  "1d": { fetch: "1d" },
  "1wk": { fetch: "1wk" },
  "1w": { fetch: "1wk" },
  "1mo": { fetch: "1mo" },
  "1M": { fetch: "1mo" },
};

// Yahoo caps how far back each intraday interval can go. We clamp the
// requested range to these limits so the upstream call doesn't return empty.
const INTERVAL_MAX_SECONDS: Record<string, number> = {
  "1m": 7 * 86400,
  "2m": 60 * 86400,
  "5m": 60 * 86400,
  "15m": 60 * 86400,
  "30m": 60 * 86400,
  "90m": 60 * 86400,
  "60m": 730 * 86400,
};

// Aggregate finer candles into fixed-size time buckets (open=first, high=max,
// low=min, close=last, volume=sum).
function resampleCandles(candles: Candle[], bucketSec: number): Candle[] {
  if (!candles.length) return candles;
  const buckets = new Map<number, Candle>();
  for (const c of candles) {
    const t = Math.floor(new Date(c.timestamp).getTime() / 1000);
    const key = Math.floor(t / bucketSec) * bucketSec;
    const b = buckets.get(key);
    if (!b) {
      buckets.set(key, {
        timestamp: new Date(key * 1000).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
    } else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.volume += c.volume;
    }
  }
  return Array.from(buckets.values()).sort(
    (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp),
  );
}

export interface CorporateAction {
  type: "dividend" | "split" | "earnings";
  date: string; // ISO
  label: string;
  amount?: number;
}

export interface MarketStatus {
  symbol: string;
  status: "open" | "closed" | "pre" | "post";
  raw_state: string | null;
  exchange: string | null;
  timezone: string | null;
  last_time: string | null;
}

// A real browser User-Agent. yahoo-finance2 sends a bot-like UA that Yahoo
// 429s aggressively from container IPs; calling the endpoint directly with a
// browser UA bypasses the rate limiter entirely.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface YahooChart {
  candles: Candle[];
  meta: Record<string, unknown>;
  events: Record<string, unknown>;
}

// Raw Yahoo chart fetch — returns candles + meta (market state) + events
// (dividends/splits). `fetchInterval` is the native Yahoo interval.
async function chartFromYahoo(
  symbol: string,
  fetchInterval: string,
  range: string,
  withEvents = false,
): Promise<YahooChart> {
  // Clamp the look-back to Yahoo's per-interval limit so we don't get an
  // empty result (e.g. 1m data only goes back 7 days).
  const wanted = PERIOD_TO_SECONDS[range] ?? 30 * 86400;
  const maxBack = INTERVAL_MAX_SECONDS[fetchInterval] ?? wanted;
  const back = Math.min(wanted, maxBack);
  const period1 = Math.floor(Date.now() / 1000) - back;
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const { data } = await axios.get(url, {
    params: {
      interval: fetchInterval,
      period1,
      period2,
      includePrePost: false,
      ...(withEvents ? { events: "div,splits" } : {}),
    },
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    timeout: 30_000,
  });
  const result = data?.chart?.result?.[0];
  if (!result) return { candles: [], meta: {}, events: {} };
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
  return { candles: out, meta: result.meta ?? {}, events: result.events ?? {} };
}

async function historyFromYahoo(
  symbol: string,
  interval: string,
  range: string,
): Promise<Candle[]> {
  const plan = INTERVAL_PLAN[interval] ?? { fetch: interval };
  const { candles } = await chartFromYahoo(symbol, plan.fetch, range);
  return plan.bucket ? resampleCandles(candles, plan.bucket) : candles;
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

// ---------- Market status ----------

export async function getMarketStatus(symbol: string): Promise<MarketStatus> {
  return remember(`mktstatus:${symbol}`, 20, async () => {
    let meta: Record<string, unknown> = {};
    try {
      ({ meta } = await chartFromYahoo(symbol, "1d", "5d"));
    } catch {
      /* fall through with empty meta */
    }
    const rawState = (meta.marketState as string | undefined) ?? null;
    const map: Record<string, MarketStatus["status"]> = {
      REGULAR: "open",
      PRE: "pre",
      PREPRE: "pre",
      POST: "post",
      POSTPOST: "post",
      CLOSED: "closed",
    };
    const t = meta.regularMarketTime as number | undefined;
    return {
      symbol,
      status: rawState ? (map[rawState] ?? "closed") : "closed",
      raw_state: rawState,
      exchange: (meta.exchangeName as string | undefined) ?? null,
      timezone: (meta.timezone as string | undefined) ?? null,
      last_time: t ? new Date(t * 1000).toISOString() : null,
    };
  });
}

// ---------- Corporate actions ----------

export async function getCorporateActions(
  symbol: string,
  range = "5y",
): Promise<CorporateAction[]> {
  return remember(`corpactions:${symbol}:${range}`, 60 * 60, async () => {
    const actions: CorporateAction[] = [];
    // 1) Dividends + splits come from the chart `events` block.
    try {
      const { events } = await chartFromYahoo(symbol, "1d", range, true);
      const divs = (events.dividends ?? {}) as Record<string, { amount?: number; date?: number }>;
      for (const d of Object.values(divs)) {
        if (!d?.date) continue;
        actions.push({
          type: "dividend",
          date: new Date(d.date * 1000).toISOString(),
          amount: d.amount,
          label: d.amount != null ? `Dividend ${d.amount}` : "Dividend",
        });
      }
      const splits = (events.splits ?? {}) as Record<string, { date?: number; splitRatio?: string }>;
      for (const s of Object.values(splits)) {
        if (!s?.date) continue;
        actions.push({
          type: "split",
          date: new Date(s.date * 1000).toISOString(),
          label: `Split ${s.splitRatio ?? ""}`.trim(),
        });
      }
    } catch {
      /* dividends/splits unavailable */
    }
    // 2) Earnings dates from quoteSummary.
    try {
      const res = await quoteSummary(symbol, ["calendarEvents", "earnings"]);
      const cal = (res.calendarEvents ?? {}) as Record<string, unknown>;
      const earnings = (cal.earnings ?? {}) as Record<string, unknown>;
      const dates = (earnings.earningsDate ?? []) as Array<{ raw?: number }>;
      for (const d of dates) {
        if (!d?.raw) continue;
        actions.push({
          type: "earnings",
          date: new Date(d.raw * 1000).toISOString(),
          label: "Earnings",
        });
      }
    } catch {
      /* earnings unavailable */
    }
    return actions.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  });
}

// ---------- Fundamentals ----------

function numOf(v: unknown): number | null {
  const x = rawOf(v);
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export async function getFundamentals(symbol: string): Promise<Record<string, unknown>> {
  return remember(`fundamentals:${symbol}`, 30 * 60, async () => {
    const r = await quoteSummary(symbol, [
      "price", "summaryDetail", "defaultKeyStatistics", "financialData",
      "incomeStatementHistory", "assetProfile",
    ]);
    const price = (r.price ?? {}) as Record<string, unknown>;
    const sd = (r.summaryDetail ?? {}) as Record<string, unknown>;
    const ks = (r.defaultKeyStatistics ?? {}) as Record<string, unknown>;
    const fd = (r.financialData ?? {}) as Record<string, unknown>;
    const ap = (r.assetProfile ?? {}) as Record<string, unknown>;
    const incRaw = ((r.incomeStatementHistory as Record<string, unknown> | undefined)
      ?.incomeStatementHistory ?? []) as Array<Record<string, unknown>>;
    const income_statement = incRaw.map((o) => {
      const e = rawOf(o.endDate);
      return {
        fy: typeof e === "number" ? new Date(e * 1000).getUTCFullYear() : null,
        revenue: numOf(o.totalRevenue),
        net_income: numOf(o.netIncome),
        gross_profit: numOf(o.grossProfit),
        operating_income: numOf(o.operatingIncome),
        ebit: numOf(o.ebit),
      };
    });
    return {
      symbol,
      name: rawOf(price.longName) ?? rawOf(price.shortName) ?? symbol,
      currency: rawOf(price.currency),
      exchange: rawOf(price.exchangeName),
      sector: rawOf(ap.sector),
      industry: rawOf(ap.industry),
      market_cap: numOf(price.marketCap),
      enterprise_value: numOf(ks.enterpriseValue),
      beta: numOf(sd.beta),
      shares_outstanding: numOf(ks.sharesOutstanding),
      float_shares: numOf(ks.floatShares),
      fifty_two_week_high: numOf(sd.fiftyTwoWeekHigh),
      fifty_two_week_low: numOf(sd.fiftyTwoWeekLow),
      avg_volume: numOf(sd.averageVolume),
      valuation: {
        pe: numOf(sd.trailingPE), forward_pe: numOf(sd.forwardPE), peg: numOf(ks.pegRatio),
        pb: numOf(ks.priceToBook), ps: numOf(sd.priceToSalesTrailing12Months),
        ev_ebitda: numOf(ks.enterpriseToEbitda), dividend_yield: numOf(sd.dividendYield),
        eps_trailing: numOf(ks.trailingEps), eps_forward: numOf(ks.forwardEps), book_value: numOf(ks.bookValue),
      },
      profitability: {
        gross_margin: numOf(fd.grossMargins), operating_margin: numOf(fd.operatingMargins),
        ebitda_margin: numOf(fd.ebitdaMargins), net_margin: numOf(fd.profitMargins),
        roe: numOf(fd.returnOnEquity), roa: numOf(fd.returnOnAssets),
      },
      health: {
        total_cash: numOf(fd.totalCash), total_debt: numOf(fd.totalDebt),
        debt_to_equity: numOf(fd.debtToEquity), current_ratio: numOf(fd.currentRatio),
        quick_ratio: numOf(fd.quickRatio), free_cash_flow: numOf(fd.freeCashflow),
        operating_cash_flow: numOf(fd.operatingCashflow), total_revenue: numOf(fd.totalRevenue), ebitda: numOf(fd.ebitda),
      },
      growth: { revenue_growth: numOf(fd.revenueGrowth), earnings_growth: numOf(fd.earningsGrowth) },
      analyst: {
        target_mean: numOf(fd.targetMeanPrice), target_high: numOf(fd.targetHighPrice),
        target_low: numOf(fd.targetLowPrice), recommendation: rawOf(fd.recommendationKey),
        analysts: numOf(fd.numberOfAnalystOpinions),
      },
      holdings: { insiders: numOf(ks.heldPercentInsiders), institutions: numOf(ks.heldPercentInstitutions) },
      income_statement,
    };
  });
}

// ---------- Peer comparison ----------

export async function comparePeers(symbols: string[]): Promise<Array<Record<string, unknown>>> {
  const results = await Promise.allSettled(
    symbols.map((s) =>
      remember(`peer:${s}`, 30 * 60, async (): Promise<Record<string, unknown>> => {
        const r = await quoteSummary(s, ["price", "summaryDetail", "financialData", "defaultKeyStatistics"]);
        const price = (r.price ?? {}) as Record<string, unknown>;
        const sd = (r.summaryDetail ?? {}) as Record<string, unknown>;
        const fd = (r.financialData ?? {}) as Record<string, unknown>;
        const ks = (r.defaultKeyStatistics ?? {}) as Record<string, unknown>;
        return {
          symbol: s,
          name: rawOf(price.longName) ?? rawOf(price.shortName) ?? s,
          currency: rawOf(price.currency),
          market_cap: numOf(price.marketCap),
          pe: numOf(sd.trailingPE),
          forward_pe: numOf(sd.forwardPE),
          pb: numOf(ks.priceToBook),
          roe: numOf(fd.returnOnEquity),
          net_margin: numOf(fd.profitMargins),
          revenue_growth: numOf(fd.revenueGrowth),
          earnings_growth: numOf(fd.earningsGrowth),
          debt_to_equity: numOf(fd.debtToEquity),
          dividend_yield: numOf(sd.dividendYield),
          recommendation: rawOf(fd.recommendationKey),
        };
      }),
    ),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === "fulfilled")
    .map((r) => r.value);
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
