import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SentimentGauge } from '@/components/charts/SentimentGauge';
import { useInsights, type Insight } from '@/hooks/api/useInsights';

export default function SentimentDashboard() {
  const { data: insights = [], isLoading } = useInsights({
    agent: 'sentiment',
    limit: 30,
  });

  // Latest per symbol
  const latest = useMemo(() => {
    const map = new Map<string, (typeof insights)[number]>();
    for (const i of insights) {
      if (!map.has(i.symbol)) map.set(i.symbol, i);
    }
    return [...map.values()];
  }, [insights]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" />
          Sentiment
        </h1>
        <p className="text-sm text-muted mt-1">
          Reddit crowd-mood read per symbol (distinct from the directional News Agent).
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : latest.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            No sentiment insights yet. Run{' '}
            <Link to="/analysis" className="text-accent hover:underline">
              full analysis
            </Link>{' '}
            or call <code>POST /agents/sentiment/run</code>.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {latest.map((i) => (
            <SentimentTile key={i.id} insight={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function SentimentTile({ insight }: { insight: Insight }) {
  const data = insight.data as Record<string, unknown>;
  const mood = String(data.crowd_mood ?? 'neutral');
  const volume = String(data.discussion_volume ?? 'low');
  const topics = Array.isArray(data.notable_topics) ? (data.notable_topics as string[]) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono">{insight.symbol}</CardTitle>
          <Badge
            variant={
              (insight.sentiment as 'bullish' | 'bearish' | 'neutral') ?? 'neutral'
            }
          >
            {insight.sentiment ?? 'neutral'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <SentimentGauge score={insight.score ?? 0} label="score" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Mood</div>
            <div className="capitalize">{mood}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Volume</div>
            <div className="capitalize">{volume}</div>
          </div>
        </div>
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topics.slice(0, 6).map((t, i) => (
              <Badge key={i} variant="default" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
        {insight.summary && (
          <p className="text-xs text-text/75 line-clamp-3">{insight.summary}</p>
        )}
      </CardContent>
    </Card>
  );
}
