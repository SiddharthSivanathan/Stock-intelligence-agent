import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  XCircle,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStreamStore, type AgentRunNode, type AgentStatus } from '@/stores/stream';
import { cn } from '@/lib/utils';

const NODE_LABELS: Record<string, string> = {
  news: 'News',
  technical: 'Technical',
  fundamentals: 'Fundamentals',
  sentiment: 'Sentiment',
  risk: 'Risk',
  recommendation: 'Synthesis',
};

const STATUS_META: Record<
  AgentStatus,
  { label: string; color: string; Icon: typeof CheckCircle2 }
> = {
  idle: { label: 'Idle', color: 'text-muted', Icon: CircleDashed },
  running: { label: 'Running', color: 'text-accent', Icon: Loader2 },
  completed: { label: 'Completed', color: 'text-up', Icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'text-down', Icon: XCircle },
};

function NodeRow({ node }: { node: AgentRunNode }) {
  const meta = STATUS_META[node.status];
  const { Icon } = meta;
  return (
    <motion.div
      layout
      className="flex items-center gap-3 rounded-md border border-border bg-panel-2/40 px-3 py-2"
    >
      <Icon
        className={cn('h-4 w-4 shrink-0', meta.color, node.status === 'running' && 'animate-spin')}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {NODE_LABELS[node.name] ?? node.name}
          </span>
          <span className={cn('text-[10px] uppercase tracking-wider', meta.color)}>
            {meta.label}
          </span>
        </div>
        <p className="truncate text-xs text-muted">
          {node.task ?? (node.status === 'idle' ? 'Waiting…' : node.summary ?? '')}
        </p>
      </div>
      <div className="shrink-0 text-right font-mono text-[11px] text-muted tabular-nums">
        {node.confidence != null && (
          <div className="text-text">{Math.round(node.confidence * 100)}%</div>
        )}
        {node.duration_ms != null && <div>{(node.duration_ms / 1000).toFixed(1)}s</div>}
      </div>
    </motion.div>
  );
}

interface Props {
  /** Only render when the live run targets this symbol (optional filter). */
  symbol?: string;
}

/**
 * Real-time view of the multi-agent workflow, driven by WebSocket `agent`
 * events accumulated in the stream store. Shows per-agent status, progress,
 * confidence, duration and a live processing log.
 */
export function AgentLiveMonitor({ symbol }: Props) {
  const run = useStreamStore((s) => s.agentRun);
  if (!run) return null;
  if (symbol && run.symbol.toUpperCase() !== symbol.toUpperCase()) return null;

  const pct = Math.round(run.progress * 100);
  const running = run.status === 'running';
  const nodes = Object.values(run.nodes);

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            ) : run.status === 'failed' ? (
              <XCircle className="h-4 w-4 text-down" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-up" />
            )}
            Live Agent Monitor · <span className="font-mono">{run.symbol}</span>
          </CardTitle>
          <Badge
            variant={
              run.status === 'completed'
                ? 'bullish'
                : run.status === 'failed'
                ? 'bearish'
                : 'default'
            }
          >
            {running ? `Analyzing… ${pct}%` : run.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* overall progress */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-panel-2">
          <motion.div
            className="h-full rounded-full bg-accent"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        {/* per-agent status */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {nodes.map((n) => (
            <NodeRow key={n.name} node={n} />
          ))}
        </div>

        {/* processing log */}
        {run.logs.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted">
              <Clock className="h-3 w-3" /> Processing log
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-bg/40 p-2 font-mono text-[11px]">
              <AnimatePresence initial={false}>
                {run.logs
                  .slice()
                  .reverse()
                  .map((l, i) => (
                    <motion.div
                      key={`${l.ts}-${i}`}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-2"
                    >
                      <span className="text-muted">
                        {new Date(l.ts).toLocaleTimeString()}
                      </span>
                      <span
                        className={cn(
                          l.status === 'failed'
                            ? 'text-down'
                            : l.status === 'completed'
                            ? 'text-up'
                            : 'text-text/80'
                        )}
                      >
                        {l.message}
                      </span>
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        <div className="text-right text-[10px] text-muted">
          Last updated {new Date(run.updated_at).toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
}
