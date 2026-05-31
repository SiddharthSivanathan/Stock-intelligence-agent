import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
  timestamp: string;
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

export function useQuote(symbol: string | undefined) {
  return useQuery({
    queryKey: ['quote', symbol],
    queryFn: async () => {
      const { data } = await api.get<Quote>(`/stocks/${symbol}/quote`);
      return data;
    },
    enabled: !!symbol,
    refetchInterval: 30_000,
  });
}

export function useHistory(symbol: string | undefined, range = '1mo', interval = '1d') {
  return useQuery({
    queryKey: ['history', symbol, range, interval],
    queryFn: async () => {
      const { data } = await api.get<Candle[]>(
        `/stocks/${symbol}/history`,
        { params: { range, interval } }
      );
      return data;
    },
    enabled: !!symbol,
  });
}

export function useProfile(symbol: string | undefined) {
  return useQuery({
    queryKey: ['profile', symbol],
    queryFn: async () => {
      const { data } = await api.get<CompanyProfile>(`/stocks/${symbol}/profile`);
      return data;
    },
    enabled: !!symbol,
    staleTime: 60 * 60_000,
  });
}

export function useWatchlistQuotes() {
  return useQuery({
    queryKey: ['watchlist-quotes'],
    queryFn: async () => {
      const { data } = await api.get<Quote[]>('/watchlist/quotes');
      return data;
    },
    refetchInterval: 30_000,
  });
}
