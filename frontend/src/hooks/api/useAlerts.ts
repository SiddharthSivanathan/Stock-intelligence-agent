import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AlertRule {
  id: number;
  user_id: number;
  symbol: string;
  condition_type: string;
  direction: 'above' | 'below';
  threshold: number;
  is_active: boolean;
  cooldown_seconds: number;
  notify_via_ws: boolean;
  notify_via_email: boolean;
  re_run_analysis: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertEvent {
  id: number;
  rule_id: number;
  symbol: string;
  price_at_fire: number | null;
  change_pct_at_fire: number | null;
  message: string;
  fired_at: string;
}

export interface AlertRuleCreate {
  symbol: string;
  direction: 'above' | 'below';
  threshold: number;
  cooldown_seconds?: number;
  notify_via_ws?: boolean;
  notify_via_email?: boolean;
  re_run_analysis?: boolean;
  is_active?: boolean;
}

export interface AlertRuleUpdate {
  threshold?: number;
  direction?: 'above' | 'below';
  cooldown_seconds?: number;
  notify_via_ws?: boolean;
  notify_via_email?: boolean;
  re_run_analysis?: boolean;
  is_active?: boolean;
}

export function useAlertRules() {
  return useQuery({
    queryKey: ['alert-rules'],
    queryFn: async () => {
      const { data } = await api.get<AlertRule[]>('/alerts');
      return data;
    },
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AlertRuleCreate) => {
      const { data } = await api.post<AlertRule>('/alerts', body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useUpdateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; body: AlertRuleUpdate }) => {
      const { data } = await api.patch<AlertRule>(`/alerts/${params.id}`, params.body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/alerts/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useAlertEvents(limit = 50) {
  return useQuery({
    queryKey: ['alert-events', limit],
    queryFn: async () => {
      const { data } = await api.get<AlertEvent[]>('/alerts/events', {
        params: { limit },
      });
      return data;
    },
    refetchInterval: 15_000,
  });
}
