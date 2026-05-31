import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { AnalysisResult } from '@/hooks/api/useAgents';

const SIGNAL_NODES = ['news', 'technical', 'fundamentals', 'sentiment', 'risk'] as const;

interface NodeStatus {
  status: 'success' | 'failed' | 'pending';
  duration_ms: number;
}

function buildStatusMap(trace: AnalysisResult['trace']): Record<string, NodeStatus> {
  const map: Record<string, NodeStatus> = {};
  for (const t of trace) {
    // For repeated nodes (recommendation reflection), keep the most recent
    map[t.node] = {
      status: t.status === 'success' ? 'success' : 'failed',
      duration_ms: t.duration_ms,
    };
  }
  return map;
}

const STATUS_COLOR: Record<string, string> = {
  success: 'bg-accent/15 border-accent/50 text-accent shadow-glow',
  failed: 'bg-danger/15 border-danger/50 text-danger',
  pending: 'bg-panel-2 border-border text-muted',
};

export function AgentTraceGraph({ rec }: { rec: AnalysisResult }) {
  const status = buildStatusMap(rec.trace);
  const recAttempts = rec.trace.filter((t) => t.node === 'recommendation').length;

  return (
    <div className="relative w-full">
      {/* SVG layer for connecting lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="none"
      >
        {SIGNAL_NODES.map((_, i) => {
          const fromX = `${10 + i * 20}%`;
          return (
            <line
              key={i}
              x1={fromX}
              y1="38%"
              x2="50%"
              y2="78%"
              stroke="hsl(222, 20%, 22%)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}
      </svg>

      <div className="relative grid grid-cols-5 gap-2 mb-12">
        {SIGNAL_NODES.map((node, i) => {
          const s = status[node] ?? { status: 'pending', duration_ms: 0 };
          return (
            <motion.div
              key={node}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                'border rounded-lg px-3 py-2 text-center',
                STATUS_COLOR[s.status]
              )}
            >
              <div className="text-xs capitalize font-medium">{node}</div>
              <div className="font-mono text-[10px] mt-0.5 opacity-80">
                {s.duration_ms ? `${(s.duration_ms / 1000).toFixed(1)}s` : '—'}
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={cn(
          'relative max-w-sm mx-auto border rounded-lg px-4 py-3 text-center',
          STATUS_COLOR[(status.recommendation?.status as string) ?? 'pending']
        )}
      >
        <div className="text-sm font-semibold">Recommendation</div>
        <div className="text-[10px] font-mono mt-0.5 opacity-80">
          {status.recommendation
            ? `${(status.recommendation.duration_ms / 1000).toFixed(1)}s`
            : '—'}
          {recAttempts > 1 && ` · ${recAttempts} attempts (reflection)`}
        </div>
      </motion.div>
    </div>
  );
}
