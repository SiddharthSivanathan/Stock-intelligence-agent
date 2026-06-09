/**
 * Lookup table from agent name → instance. Used by the routes and the
 * LangGraph-style workflow in Phase 7.
 */
import { NewsAgent } from "./news.js";
import { TechnicalAgent } from "./technical.js";
import { FundamentalsAgent } from "./fundamentals.js";
import { SentimentAgent } from "./sentiment.js";
import { RiskAgent } from "./risk.js";
import type { BaseAgent } from "./base.js";

export const agents = {
  news: new NewsAgent(),
  technical: new TechnicalAgent(),
  fundamentals: new FundamentalsAgent(),
  sentiment: new SentimentAgent(),
  risk: new RiskAgent(),
} as const;

export type AgentName = keyof typeof agents;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgent = BaseAgent<any>;
