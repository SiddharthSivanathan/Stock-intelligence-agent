import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AnalysisResult } from './useAgents';

export function useRecommendations(opts: { symbol?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['recommendations', opts],
    queryFn: async () => {
      const { data } = await api.get<AnalysisResult[]>('/recommendations', {
        params: opts,
      });
      return data;
    },
  });
}

export function useRecommendation(id: number | undefined) {
  return useQuery({
    queryKey: ['recommendation', id],
    queryFn: async () => {
      const { data } = await api.get<AnalysisResult>(`/recommendations/${id}`);
      return data;
    },
    enabled: !!id,
  });
}
