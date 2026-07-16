import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AgentName =
  | 'news'
  | 'technical'
  | 'fundamentals'
  | 'sentiment'
  | 'risk';

export interface AgentLog {
  id: number;
  agent_name: string;
  symbol: string | null;
  status: 'success' | 'failed';
  duration_ms: number;
  error: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
}

export interface ContributingSignal {
  agent: string;
  sentiment: string | null;
  score: number | null;
  weight: number;
  note: string;
}

export type Rating = 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell';

/** The comprehensive, explainable company report produced by the orchestrator. */
export interface CompanyReport {
  executive_summary: string;
  business_overview: string;
  competitive_position: string;
  industry_analysis: string;
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  financial_health_score: number;
  growth_potential: string;
  profitability: string;
  valuation: string;
  technical_summary: string;
  sentiment_summary: string;
  news_impact: string;
  risk_assessment: string;
  key_strengths: string[];
  key_weaknesses: string[];
  opportunities: string[];
  risks: string[];
  long_term_outlook: string;
  short_term_outlook: string;
}

export type ActionType =
  | 'investment'
  | 'risk_alert'
  | 'growth_opportunity'
  | 'competitive_threat'
  | 'sector_trend'
  | 'technical_signal'
  | 'news_event'
  | 'earnings_impact'
  | 'watchlist'
  | 'portfolio';

export interface ActionItem {
  type: ActionType;
  title: string;
  detail: string;
  confidence: number;
}

export interface AnalysisResult {
  id: number;
  run_id?: string;
  symbol: string;
  action: 'buy' | 'hold' | 'sell';
  rating: Rating;
  confidence: number;
  score: number;
  summary: string;
  reasoning: string;
  contributing_signals: ContributingSignal[];
  report: CompanyReport | null;
  actions: ActionItem[];
  /** Non-fatal degradations (e.g. AI synthesis fell back to heuristics). */
  warnings?: string[];
  insights: Record<string, Record<string, unknown> | null>;
  trace: Array<{
    node: string;
    status: string;
    duration_ms: number;
    attempt?: number;
    error?: string;
  }>;
  errors: Array<Record<string, unknown>>;
  duration_ms: number;
  created_at: string;
}

export function useRunAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (symbol: string) => {
      const { data } = await api.post<AnalysisResult>('/agents/analyze', {
        symbol,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recommendations'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
      qc.invalidateQueries({ queryKey: ['agent-logs'] });
    },
  });
}

export function useRunAgent(agent: AgentName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post(`/agents/${agent}/run`, body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insights'] });
      qc.invalidateQueries({ queryKey: ['agent-logs'] });
    },
  });
}

export function useAgentLogs(opts: { agent?: string; symbol?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['agent-logs', opts],
    queryFn: async () => {
      const { data } = await api.get<AgentLog[]>('/agents/logs', { params: opts });
      return data;
    },
  });
}
