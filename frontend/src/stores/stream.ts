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

// ---- Live multi-agent run (Agent Monitor) ----

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface AgentEvent {
  run_id: string;
  symbol: string;
  phase: 'start' | 'agent' | 'synthesis' | 'complete' | 'error';
  agent?: string;
  status: 'running' | 'completed' | 'failed';
  task?: string;
  progress: number;
  duration_ms?: number;
  confidence?: number;
  score?: number;
  summary?: string;
  message?: string;
  ts: string;
}

export interface AgentRunNode {
  name: string;
  status: AgentStatus;
  task?: string;
  duration_ms?: number;
  confidence?: number;
  score?: number;
  summary?: string;
  updated_at: string;
}

export interface AgentRunLog {
  ts: string;
  message: string;
  status: string;
  agent?: string;
}

export interface AgentRun {
  run_id: string;
  symbol: string;
  phase: AgentEvent['phase'];
  status: 'running' | 'completed' | 'failed';
  progress: number;
  nodes: Record<string, AgentRunNode>;
  logs: AgentRunLog[];
  started_at: string;
  updated_at: string;
}

// The signal agents + synthesis node, in execution order. Rendered as "idle"
// until their first event arrives so the monitor shows the full pipeline.
export const AGENT_ORDER = [
  'news',
  'technical',
  'fundamentals',
  'sentiment',
  'risk',
  'recommendation',
] as const;

function freshRun(ev: AgentEvent): AgentRun {
  const nodes: Record<string, AgentRunNode> = {};
  for (const name of AGENT_ORDER) {
    nodes[name] = { name, status: 'idle', updated_at: ev.ts };
  }
  return {
    run_id: ev.run_id,
    symbol: ev.symbol,
    phase: 'start',
    status: 'running',
    progress: 0,
    nodes,
    logs: [],
    started_at: ev.ts,
    updated_at: ev.ts,
  };
}

interface StreamState {
  connected: boolean;
  subscriptions: string[];
  prices: Record<string, PriceTick>;
  recentAlerts: AlertNotification[];
  /** Current (or most recent) live multi-agent analysis run. */
  agentRun: AgentRun | null;

  setConnected: (c: boolean) => void;
  setSubscriptions: (s: string[]) => void;
  updatePrice: (tick: PriceTick) => void;
  pushAlert: (alert: AlertNotification) => void;
  clearAlerts: () => void;
  applyAgentEvent: (ev: AgentEvent) => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  connected: false,
  subscriptions: [],
  prices: {},
  recentAlerts: [],
  agentRun: null,

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

  applyAgentEvent: (ev) =>
    set((state) => {
      // A new run (or the first event we see) resets the panel.
      let run =
        state.agentRun && state.agentRun.run_id === ev.run_id
          ? { ...state.agentRun, nodes: { ...state.agentRun.nodes }, logs: state.agentRun.logs }
          : freshRun(ev);

      // Update the node this event refers to (synthesis maps to 'recommendation').
      const nodeKey = ev.phase === 'synthesis' ? 'recommendation' : ev.agent;
      if (nodeKey && run.nodes[nodeKey]) {
        run.nodes[nodeKey] = {
          ...run.nodes[nodeKey],
          status: ev.status,
          task: ev.task ?? run.nodes[nodeKey].task,
          duration_ms: ev.duration_ms ?? run.nodes[nodeKey].duration_ms,
          confidence: ev.confidence ?? run.nodes[nodeKey].confidence,
          score: ev.score ?? run.nodes[nodeKey].score,
          summary: ev.summary ?? run.nodes[nodeKey].summary,
          updated_at: ev.ts,
        };
      }

      run.phase = ev.phase;
      run.progress = Math.max(run.progress, ev.progress ?? run.progress);
      run.updated_at = ev.ts;
      if (ev.phase === 'complete') run.status = 'completed';
      if (ev.phase === 'error') run.status = 'failed';

      if (ev.message) {
        run.logs = [
          ...run.logs,
          { ts: ev.ts, message: ev.message, status: ev.status, agent: ev.agent },
        ].slice(-60);
      }

      return { agentRun: run };
    }),
}));
