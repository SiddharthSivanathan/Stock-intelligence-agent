/**
 * News Agent — fetch recent headlines, ask the LLM to score them.
 * Source priority: NewsAPI > Finnhub company-news > Yahoo Finance RSS.
 */
import axios from "axios";
import { z } from "zod";
import { BaseAgent, baseInsightSchema, type AgentContext } from "./base.js";
import { config } from "../../config.js";

const schema = baseInsightSchema.extend({
  key_themes: z.array(z.string()).default([]),
  notable_headlines: z
    .array(
      z.object({
        title: z.string(),
        impact: z.enum(["positive", "negative", "neutral"]).catch("neutral"),
      }),
    )
    .default([]),
});

interface Headline {
  title: string;
  source: string;
  published_at: string;
  url: string;
}

async function fetchNewsApi(symbol: string, limit: number): Promise<Headline[]> {
  if (!config.NEWSAPI_KEY) return [];
  try {
    const { data } = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: symbol,
        sortBy: "publishedAt",
        language: "en",
        pageSize: limit,
        apiKey: config.NEWSAPI_KEY,
      },
      timeout: 15_000,
    });
    return (data?.articles ?? []).map((a: any) => ({
      title: a.title ?? "",
      source: a.source?.name ?? "newsapi",
      published_at: a.publishedAt ?? "",
      url: a.url ?? "",
    }));
  } catch {
    return [];
  }
}

async function fetchFinnhub(symbol: string, limit: number): Promise<Headline[]> {
  if (!config.FINNHUB_API_KEY) return [];
  try {
    const today = new Date();
    const past = new Date(Date.now() - 14 * 86400 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const { data } = await axios.get("https://finnhub.io/api/v1/company-news", {
      params: { symbol, from: fmt(past), to: fmt(today), token: config.FINNHUB_API_KEY },
      timeout: 15_000,
    });
    return (data ?? []).slice(0, limit).map((a: any) => ({
      title: a.headline ?? "",
      source: a.source ?? "finnhub",
      published_at: new Date((a.datetime ?? 0) * 1000).toISOString(),
      url: a.url ?? "",
    }));
  } catch {
    return [];
  }
}

/**
 * Yahoo Finance headline RSS — the free, keyless fallback. Works for US tickers
 * and Indian `.NS`/`.BO` symbols. We parse the RSS with a small regex rather
 * than pulling in an XML dependency.
 */
async function fetchYahooRss(symbol: string, limit: number): Promise<Headline[]> {
  try {
    const { data } = await axios.get<string>(
      "https://feeds.finance.yahoo.com/rss/2.0/headline",
      {
        params: { s: symbol, region: "US", lang: "en-US" },
        headers: { "User-Agent": "Mozilla/5.0 stock-intelligence-bot/0.1" },
        responseType: "text",
        timeout: 15_000,
      },
    );
    const items = data.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    const decode = (s: string) =>
      s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
    return items.slice(0, limit).map((it) => ({
      title: decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""),
      source: "Yahoo Finance",
      published_at: (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "").trim(),
      url: (it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim(),
    })).filter((h) => h.title);
  } catch {
    return [];
  }
}

export class NewsAgent extends BaseAgent<z.infer<typeof schema>> {
  readonly name = "news";
  readonly outputSchema = schema;

  protected async buildPrompt(ctx: AgentContext) {
    const limit = (ctx.limit as number) ?? 8;
    // Source priority: NewsAPI > Finnhub > Yahoo Finance RSS (keyless fallback).
    let headlines = await fetchNewsApi(ctx.symbol, limit);
    if (!headlines.length) headlines = await fetchFinnhub(ctx.symbol, limit);
    if (!headlines.length) headlines = await fetchYahooRss(ctx.symbol, limit);

    const list =
      headlines.length === 0
        ? "(no recent headlines available)"
        : headlines
            .map((h, i) => `${i + 1}. ${h.title} — ${h.source} (${h.published_at})`)
            .join("\n");

    return {
      passthrough: { headlines },
      messages: [
        {
          role: "system" as const,
          content:
            "You are a financial news analyst. Read the headlines and produce a structured " +
            "JSON judgement. Score is in [-1, 1] where +1 is very bullish, -1 very bearish. " +
            "Confidence in [0, 1] reflects how clearly the news supports your read.",
        },
        {
          role: "user" as const,
          content:
            `Symbol: ${ctx.symbol}\nHeadlines:\n${list}\n\n` +
            'Reply with ONLY JSON: {"sentiment":"bullish|bearish|neutral","confidence":0..1,' +
            '"score":-1..1,"summary":"...","key_themes":["..."],' +
            '"notable_headlines":[{"title":"...","impact":"positive|negative|neutral"}]}',
        },
      ],
    };
  }
}
