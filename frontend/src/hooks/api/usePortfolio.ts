import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PositionView {
  symbol: string;
  qty: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  pnl: number;
  pnl_pct: number;
  currency: string | null;
}

export interface PortfolioSnapshot {
  starting_cash: number;
  cash: number;
  positions_value: number;
  total_value: number;
  total_pnl: number;
  total_pnl_pct: number;
  positions: PositionView[];
}

export interface Trade {
  id: number;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  value: number;
  executed_at: string;
}

export function usePortfolio() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const { data } = await api.get<PortfolioSnapshot>('/portfolio');
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { symbol: string; side: 'buy' | 'sell'; qty: number }) => {
      const { data } = await api.post<Trade>('/portfolio/trade', body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['portfolio-trades'] });
    },
  });
}

export function useTradeHistory(limit = 50) {
  return useQuery({
    queryKey: ['portfolio-trades', limit],
    queryFn: async () => {
      const { data } = await api.get<Trade[]>('/portfolio/trades', { params: { limit } });
      return data;
    },
  });
}

export function useResetPortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<PortfolioSnapshot>('/portfolio/reset');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['portfolio-trades'] });
    },
  });
}
