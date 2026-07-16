import { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, CheckCircle2, XCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentTraceGraph } from '@/components/agents/AgentTraceGraph';
import { AgentLiveMonitor } from '@/components/agents/AgentLiveMonitor';
import { useRecommendations } from '@/hooks/api/useRecommendations';
import { useAgentLogs } from '@/hooks/api/useAgents';
import { cn } from '@/lib/utils';

export default function AgentMonitor() {
  const { data: recs = [], isLoading } = useRecommendations({ limit: 15 });
  const { data: logs = [] } = useAgentLogs({ limit: 30 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = recs.find((r) => r.id === selectedId) ?? recs[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="h-5 w-5 text-accent" />
          Agent Monitor
        </h1>
        <p className="text-sm text-muted mt-1">
          Watch agents live during an analysis, then replay executions and inspect per-agent logs.
        </p>
      </div>

      {/* Live run — driven by WebSocket agent events while an analysis is in flight. */}
      <AgentLiveMonitor />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : recs.length === 0 ? (
              <p className="text-sm text-muted">No runs yet.</p>
            ) : (
              <div className="space-y-1 max-h-[500px] overflow-y-auto -mx-2">
                {recs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md border text-sm transition-colors',
                      selected?.id === r.id
                        ? 'border-accent/50 bg-panel-2'
                        : 'border-transparent hover:bg-panel-2/60'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold">{r.symbol}</span>
                      <Badge
                        variant={
                          r.action === 'buy'
                            ? 'bullish'
                            : r.action === 'sell'
                            ? 'bearish'
                            : 'neutral'
                        }
                      >
                        {r.action}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted mt-1 flex justify-between">
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                      <span className="font-mono">{(r.duration_ms / 1000).toFixed(1)}s</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {selected ? (
                <>
                  Trace · <span className="font-mono">{selected.symbol}</span>
                </>
              ) : (
                'Trace'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selected ? (
              <div className="space-y-6">
                <AgentTraceGraph rec={selected} />
                {selected.errors.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-wider text-muted">
                      Errors
                    </div>
                    {selected.errors.map((e, i) => (
                      <div
                        key={i}
                        className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2"
                      >
                        <span className="font-mono">{String(e.node ?? 'unknown')}</span>:{' '}
                        {String(e.error ?? 'unknown error')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Select a run on the left.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent logs</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted">No logs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted border-b border-border">
                  <tr>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 font-medium">Symbol</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 pr-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <motion.tr
                      key={l.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2 pr-3 text-muted text-xs font-mono">
                        {new Date(l.created_at).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-3 capitalize">{l.agent_name}</td>
                      <td className="py-2 pr-3 font-mono">{l.symbol ?? '—'}</td>
                      <td className="py-2 pr-3">
                        {l.status === 'success' ? (
                          <CheckCircle2 className="h-4 w-4 text-accent" />
                        ) : (
                          <XCircle className="h-4 w-4 text-danger" />
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {(l.duration_ms / 1000).toFixed(1)}s
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted">{l.model ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs text-danger truncate max-w-[280px]">
                        {l.error ?? ''}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
