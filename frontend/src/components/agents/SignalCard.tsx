import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, fmtPct } from '@/lib/utils';

interface Props {
  agent: string;
  sentiment: string | null | undefined;
  confidence: number | null | undefined;
  score: number | null | undefined;
  summary: string | null | undefined;
  extra?: React.ReactNode;
  className?: string;
}

const SENTIMENT_VARIANT: Record<string, 'bullish' | 'bearish' | 'neutral'> = {
  bullish: 'bullish',
  bearish: 'bearish',
  neutral: 'neutral',
};

export function SignalCard({
  agent,
  sentiment,
  confidence,
  score,
  summary,
  extra,
  className,
}: Props) {
  const variant = sentiment ? SENTIMENT_VARIANT[sentiment] ?? 'neutral' : 'neutral';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={cn('h-full', className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="capitalize">{agent}</CardTitle>
            {sentiment && <Badge variant={variant}>{sentiment}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">
                Score
              </div>
              <div className="font-mono tabular-nums text-base">
                {score !== null && score !== undefined ? score.toFixed(2) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">
                Confidence
              </div>
              <div className="font-mono tabular-nums text-base">
                {confidence !== null && confidence !== undefined
                  ? fmtPct(confidence * 100)
                  : '—'}
              </div>
            </div>
          </div>
          {summary && (
            <p className="text-sm text-text/80 leading-relaxed">{summary}</p>
          )}
          {extra}
        </CardContent>
      </Card>
    </motion.div>
  );
}
