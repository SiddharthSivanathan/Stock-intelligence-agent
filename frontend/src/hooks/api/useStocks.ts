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

export interface MarketStatus {
  symbol: string;
  status: 'open' | 'closed' | 'pre' | 'post';
  raw_state: string | null;
  exchange: string | null;
  timezone: string | null;
  last_time: string | null;
}

export interface CorporateAction {
  type: 'dividend' | 'split' | 'earnings';
  date: string;
  label: string;
  amount?: number;
}

export interface Fundamentals {
  symbol: string;
  name: string;
  currency: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  enterprise_value: number | null;
  beta: number | null;
  shares_outstanding: number | null;
  float_shares: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  avg_volume: number | null;
  valuation: {
    pe: number | null; forward_pe: number | null; peg: number | null; pb: number | null;
    ps: number | null; ev_ebitda: number | null; dividend_yield: number | null;
    eps_trailing: number | null; eps_forward: number | null; book_value: number | null;
  };
  profitability: {
    gross_margin: number | null; operating_margin: number | null; ebitda_margin: number | null;
    net_margin: number | null; roe: number | null; roa: number | null;
  };
  health: {
    total_cash: number | null; total_debt: number | null; debt_to_equity: number | null;
    current_ratio: number | null; quick_ratio: number | null; free_cash_flow: number | null;
    operating_cash_flow: number | null; total_revenue: number | null; ebitda: number | null;
  };
  growth: { revenue_growth: number | null; earnings_growth: number | null };
  analyst: {
    target_mean: number | null; target_high: number | null; target_low: number | null;
    recommendation: string | null; analysts: number | null;
  };
  holdings: { insiders: number | null; institutions: number | null };
  income_statement: {
    fy: number | null; revenue: number | null; net_income: number | null;
    gross_profit: number | null; operating_income: number | null; ebit: number | null;
  }[];
}

export interface PeerMetric {
  symbol: string;
  name: string;
  currency: string | null;
  market_cap: number | null;
  pe: number | null;
  forward_pe: number | null;
  pb: number | null;
  roe: number | null;
  net_margin: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  debt_to_equity: number | null;
  dividend_yield: number | null;
  recommendation: string | null;
}

export function useFundamentals(symbol: string | undefined) {
  return useQuery({
    queryKey: ['fundamentals', symbol],
    queryFn: async () => {
      const { data } = await api.get<Fundamentals>(`/stocks/${symbol}/fundamentals`);
      return data;
    },
    enabled: !!symbol,
    staleTime: 30 * 60_000,
  });
}

export function useCompare(symbols: string[]) {
  const key = symbols.join(',');
  return useQuery({
    queryKey: ['compare', key],
    queryFn: async () => {
      const { data } = await api.get<PeerMetric[]>('/stocks/compare', {
        params: { symbols: key },
      });
      return data;
    },
    enabled: symbols.length > 0,
    staleTime: 30 * 60_000,
  });
}

export function useMarketStatus(symbol: string | undefined) {
  return useQuery({
    queryKey: ['market-status', symbol],
    queryFn: async () => {
      const { data } = await api.get<MarketStatus>(`/stocks/${symbol}/market-status`);
      return data;
    },
    enabled: !!symbol,
    refetchInterval: 30_000,
  });
}

export function useCorporateActions(symbol: string | undefined, range = '5y') {
  return useQuery({
    queryKey: ['corp-actions', symbol, range],
    queryFn: async () => {
      const { data } = await api.get<CorporateAction[]>(
        `/stocks/${symbol}/corporate-actions`,
        { params: { range } }
      );
      return data;
    },
    enabled: !!symbol,
    staleTime: 30 * 60_000,
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
