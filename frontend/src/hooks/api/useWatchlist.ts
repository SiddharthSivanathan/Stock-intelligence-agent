import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface WatchlistItem {
  id: number;
  symbol: string;
  notes: string | null;
  created_at: string;
}

export function useWatchlist() {
  return useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const { data } = await api.get<WatchlistItem[]>('/watchlist');
      return data;
    },
  });
}

export function useAddToWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { symbol: string; notes?: string }) => {
      const { data } = await api.post<WatchlistItem>('/watchlist', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  });
}

export function useRemoveFromWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (symbol: string) => {
      await api.delete(`/watchlist/${symbol}`);
      return symbol;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  });
}
