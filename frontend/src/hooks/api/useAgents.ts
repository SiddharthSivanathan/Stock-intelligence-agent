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

export interface AnalysisResult {
  id: number;
  symbol: string;
  action: 'buy' | 'hold' | 'sell';
  confidence: number;
  score: number;
  summary: string;
  reasoning: string;
  contributing_signals: ContributingSignal[];
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
