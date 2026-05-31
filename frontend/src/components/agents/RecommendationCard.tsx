import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, fmtPct } from '@/lib/utils';
import type { AnalysisResult } from '@/hooks/api/useAgents';

const ACTION_VARIANT: Record<string, 'bullish' | 'bearish' | 'neutral'> = {
  buy: 'bullish',
  sell: 'bearish',
  hold: 'neutral',
};

interface Props {
  rec: AnalysisResult;
  defaultExpanded?: boolean;
  onClick?: () => void;
  className?: string;
}

export function RecommendationCard({ rec, defaultExpanded, onClick, className }: Props) {
  const actionLabel = rec.action.toUpperCase();
  const variant = ACTION_VARIANT[rec.action] ?? 'neutral';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn('cursor-pointer hover:border-accent/30 transition-colors', className)}
        onClick={onClick}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="font-mono">{rec.symbol}</CardTitle>
              <Badge variant={variant} className="text-sm px-3 py-0.5">
                {actionLabel}
              </Badge>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted">
                Confidence
              </div>
              <div className="font-mono tabular-nums text-base">
                {fmtPct(rec.confidence * 100)}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text/90 leading-relaxed">{rec.summary}</p>

          {(defaultExpanded ?? true) && (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                  Reasoning
                </div>
                <p className="text-sm text-text/75 leading-relaxed">{rec.reasoning}</p>
              </div>

              {rec.contributing_signals.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-2">
                    Contributing signals
                  </div>
                  <div className="space-y-2">
                    {rec.contributing_signals.map((s) => (
                      <div
                        key={s.agent}
                        className="flex items-start gap-3 text-sm bg-panel-2/40 rounded-md p-3 border border-border"
                      >
                        <Badge
                          variant={
                            s.sentiment
                              ? (s.sentiment as 'bullish' | 'bearish' | 'neutral')
                              : 'neutral'
                          }
                          className="capitalize shrink-0"
                        >
                          {s.agent}
                        </Badge>
                        <div className="flex-1">
                          <p className="text-text/85">{s.note}</p>
                          <div className="flex gap-4 mt-1 text-xs text-muted font-mono">
                            <span>
                              score{' '}
                              <span className="text-text">
                                {s.score !== null ? s.score.toFixed(2) : '—'}
                              </span>
                            </span>
                            <span>
                              weight{' '}
                              <span className="text-text">
                                {fmtPct(s.weight * 100)}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-muted flex items-center gap-3 pt-1">
                <span>
                  Wall time:{' '}
                  <span className="text-text font-mono">
                    {(rec.duration_ms / 1000).toFixed(1)}s
                  </span>
                </span>
                <span>
                  Score:{' '}
                  <span className="text-text font-mono">{rec.score.toFixed(2)}</span>
                </span>
                {rec.errors.length > 0 && (
                  <Badge variant="warning">{rec.errors.length} agent error(s)</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
