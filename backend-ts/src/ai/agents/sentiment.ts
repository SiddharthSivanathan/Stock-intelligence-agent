/**
 * Sentiment Agent — Reddit crowd mood via the public JSON endpoint.
 * Rate-limit-tolerant: empty list → low-confidence neutral, not a failure.
 */
import axios from "axios";
import { z } from "zod";
import { BaseAgent, baseInsightSchema, type AgentContext } from "./base.js";

// "neutral" is added to the canonical mood set because small open-weights models
// (mistral 7B in particular) almost always pick it when posts are scarce, and
// rejecting it just forces a retry that returns the same word.
const schema = baseInsightSchema.extend({
  crowd_mood: z
    .enum(["euphoric", "bullish", "mixed", "neutral", "bearish", "panicked"])
    .catch("neutral"),
  discussion_volume: z.enum(["high", "medium", "low"]).catch("low"),
  topics: z.array(z.string()).default([]),
});

interface RedditPost {
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  subreddit: string;
  created_utc: number;
}

async function fetchReddit(symbol: string, limit: number): Promise<RedditPost[]> {
  // Use the public JSON endpoint (no auth required). Subreddit `stocks` is a
  // good general-purpose source.
  try {
    const { data } = await axios.get<{ data: { children: { data: RedditPost }[] } }>(
      `https://www.reddit.com/r/stocks/search.json`,
      {
        params: { q: symbol, restrict_sr: 1, limit, sort: "new" },
        headers: { "User-Agent": "stock-intelligence-bot/0.1" },
        timeout: 15_000,
      },
    );
    return (data?.data?.children ?? []).map((c) => c.data);
  } catch {
    return [];
  }
}

export class SentimentAgent extends BaseAgent<z.infer<typeof schema>> {
  readonly name = "sentiment";
  readonly outputSchema = schema;

  protected async buildPrompt(ctx: AgentContext) {
    const limit = (ctx.limit as number) ?? 20;
    const posts = await fetchReddit(ctx.symbol, limit);

    const sample =
      posts.length === 0
        ? "(no Reddit posts available — Reddit may have rate-limited)"
        : posts
            .slice(0, 15)
            .map(
              (p, i) =>
                `${i + 1}. [${p.score}↑ ${p.num_comments}💬 r/${p.subreddit}] ${p.title}`,
            )
            .join("\n");

    return {
      passthrough: { post_count: posts.length },
      messages: [
        {
          role: "system" as const,
          content:
            "You are a social-sentiment analyst reading Reddit. Crowd mood is distinct " +
            "from professional sentiment — capture the vibe, not the fundamentals.",
        },
        {
          role: "user" as const,
          content:
            `Symbol: ${ctx.symbol}\nRecent Reddit posts:\n${sample}\n\n` +
            'Reply ONLY with JSON: {"sentiment":"bullish|bearish|neutral","confidence":0..1,' +
            '"score":-1..1,"summary":"...","crowd_mood":"euphoric|bullish|mixed|bearish|panicked",' +
            '"discussion_volume":"high|medium|low","topics":["..."]}',
        },
      ],
    };
  }
}
