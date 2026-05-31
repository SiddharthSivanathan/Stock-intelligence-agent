import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { RecommendationCard } from '@/components/agents/RecommendationCard';
import { SignalCard } from '@/components/agents/SignalCard';
import { useRecommendations } from '@/hooks/api/useRecommendations';
import { useInsights } from '@/hooks/api/useInsights';
import { fmtPct } from '@/lib/utils';

export default function AIInsights() {
  const [tab, setTab] = useState<'recs' | 'signals'>('recs');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          AI Insights
        </h1>
        <p className="text-sm text-muted mt-1">
          Recommendations from the multi-agent workflow and raw insights from individual agents.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'recs' | 'signals')}>
        <TabsList>
          <TabsTrigger value="recs">Recommendations</TabsTrigger>
          <TabsTrigger value="signals">Signal insights</TabsTrigger>
        </TabsList>
        <TabsContent value="recs" className="mt-4">
          <RecommendationsList />
        </TabsContent>
        <TabsContent value="signals" className="mt-4">
          <SignalsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RecommendationsList() {
  const { data: recs = [], isLoading } = useRecommendations({ limit: 20 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (recs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted">
          No recommendations yet. Run <span className="text-text">/agents/analyze</span> from
          the{' '}
          <Link to="/analysis" className="text-accent hover:underline">
            Stock Analysis
          </Link>{' '}
          page.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {recs.map((rec) => (
        <RecommendationCard key={rec.id} rec={rec} defaultExpanded={false} />
      ))}
    </div>
  );
}

function SignalsList() {
  const { data: insights = [], isLoading } = useInsights({ limit: 30 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-44 w-full" />
        ))}
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted">
          No agent insights yet. Run individual agents (e.g. POST /agents/news/run)
          or the full pipeline.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {insights.map((insight) => (
        <Card key={insight.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="capitalize text-base">
                {insight.agent_name}{' '}
                <span className="font-mono text-muted ml-1">{insight.symbol}</span>
              </CardTitle>
              {insight.sentiment && (
                <Badge
                  variant={
                    (insight.sentiment as 'bullish' | 'bearish' | 'neutral') ?? 'neutral'
                  }
                >
                  {insight.sentiment}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-4 text-xs text-muted font-mono">
              <span>
                score{' '}
                <span className="text-text">
                  {insight.score !== null ? insight.score.toFixed(2) : '—'}
                </span>
              </span>
              <span>
                conf{' '}
                <span className="text-text">
                  {insight.confidence !== null ? fmtPct(insight.confidence * 100) : '—'}
                </span>
              </span>
            </div>
            {insight.summary && (
              <p className="text-text/80 line-clamp-3">{insight.summary}</p>
            )}
            <div className="text-[11px] text-muted">
              {new Date(insight.created_at).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
