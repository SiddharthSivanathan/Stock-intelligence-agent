import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Insight {
  id: number;
  agent_name: string;
  symbol: string;
  sentiment: string | null;
  confidence: number | null;
  score: number | null;
  summary: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export function useInsights(opts: { symbol?: string; agent?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['insights', opts],
    queryFn: async () => {
      const { data } = await api.get<Insight[]>('/insights', { params: opts });
      return data;
    },
  });
}
