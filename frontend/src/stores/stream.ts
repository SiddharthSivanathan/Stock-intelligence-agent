import { create } from 'zustand';

export interface PriceTick {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  timestamp: string;
  source?: string;
  currency?: string;
}

export interface AlertNotification {
  rule_id: number;
  event_id?: number;
  symbol: string;
  message: string;
  price?: number;
  change_percent?: number;
  fired_at: string;
}

interface StreamState {
  connected: boolean;
  subscriptions: string[];
  prices: Record<string, PriceTick>;
  recentAlerts: AlertNotification[];

  setConnected: (c: boolean) => void;
  setSubscriptions: (s: string[]) => void;
  updatePrice: (tick: PriceTick) => void;
  pushAlert: (alert: AlertNotification) => void;
  clearAlerts: () => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  connected: false,
  subscriptions: [],
  prices: {},
  recentAlerts: [],

  setConnected: (c) => set({ connected: c }),
  setSubscriptions: (s) => set({ subscriptions: [...s].sort() }),
  updatePrice: (tick) =>
    set((state) => ({
      prices: { ...state.prices, [tick.symbol]: tick },
    })),
  pushAlert: (alert) =>
    set((state) => ({
      recentAlerts: [alert, ...state.recentAlerts].slice(0, 50),
    })),
  clearAlerts: () => set({ recentAlerts: [] }),
}));
