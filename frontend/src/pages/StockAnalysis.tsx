import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Building2, Globe, Sparkles } from 'lucide-react';
import { resolveSymbol, SUGGESTED_INDIAN, SUGGESTED_US } from '@/lib/symbols';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { SymbolSearch } from '@/components/forms/SymbolSearch';
import { PriceChart } from '@/components/charts/PriceChart';
import { RecommendationCard } from '@/components/agents/RecommendationCard';
import { AgentTraceGraph } from '@/components/agents/AgentTraceGraph';
import { AgentLiveMonitor } from '@/components/agents/AgentLiveMonitor';
import { ComprehensiveReport } from '@/components/agents/ComprehensiveReport';
import {
  useHistory,
  useProfile,
  useQuote,
} from '@/hooks/api/useStocks';
import { useRunAnalysis } from '@/hooks/api/useAgents';
import { useRecommendations } from '@/hooks/api/useRecommendations';
import { useStockTick } from '@/hooks/useStockStream';
import { cn, fmtCompact, fmtMoney, fmtPct } from '@/lib/utils';
import { toast } from '@/stores/toast';

// yfinance interval limits:
//   1m   : last 7  days only
//   2m/5m/15m/30m/60m/90m : last 60 days only
//   1h   : last 730 days
//   1d+  : unlimited
// 10m is NOT a yfinance interval; closest is 15m.
const RANGES = [
  // ---- intraday ----
  { range: '1d',  interval: '1m',  label: '1D · 1m'  },
  { range: '1d',  interval: '2m',  label: '1D · 2m'  },
  { range: '1d',  interval: '5m',  label: '1D · 5m'  },
  { range: '1d',  interval: '15m', label: '1D · 15m' },
  { range: '5d',  interval: '5m',  label: '5D · 5m'  },
  { range: '5d',  interval: '15m', label: '5D · 15m' },
  { range: '5d',  interval: '1h',  label: '5D · 1h'  },
  // ---- daily ----
  { range: '1mo', interval: '1d',  label: '1M' },
  { range: '3mo', interval: '1d',  label: '3M' },
  { range: '6mo', interval: '1d',  label: '6M' },
  { range: '1y',  interval: '1d',  label: '1Y' },
  { range: '5y',  interval: '1wk', label: '5Y' },
] as const;

// Default to "5D · 15m" — interesting movement, always within yfinance limits
const DEFAULT_RANGE_IDX = 5;

export default function StockAnalysis() {
  const { symbol } = useParams<{ symbol?: string }>();
  // Resolve alias here too — handles bookmarked / shared URLs like /analysis/NIFTY.
  const sym = symbol ? resolveSymbol(symbol) : undefined;
  const [rangeIdx, setRangeIdx] = useState(DEFAULT_RANGE_IDX);
  const range = RANGES[rangeIdx];

  if (!sym) {
    return (
      <div className="max-w-md mx-auto pt-16 text-center space-y-4">
        <h1 className="text-2xl font-bold">Stock Analysis</h1>
        <p className="text-muted text-sm">Pick a ticker to drill in.</p>
        <SymbolSearch />
        <SuggestionGrid />
      </div>
    );
  }

  return <StockAnalysisDetail symbol={sym} range={range} rangeIdx={rangeIdx} setRangeIdx={setRangeIdx} />;
}

// Quick-pick grid of common symbols. Shown on the picker screen + the
// no-data empty state.
function SuggestionGrid() {
  return (
    <div className="text-left mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <SuggestionColumn title="🇮🇳 India" items={SUGGESTED_INDIAN} />
      <SuggestionColumn title="🇺🇸 United States" items={SUGGESTED_US} />
    </div>
  );
}

function SuggestionColumn({ title, items }: { title: string; items: typeof SUGGESTED_INDIAN }) {
  return (
    <div className="border border-border rounded-md bg-panel-2/40 p-3">
      <div className="text-xs uppercase tracking-wider text-muted mb-2">{title}</div>
      <div className="space-y-1">
        {items.map((s) => (
          <Link
            key={s.symbol}
            to={`/analysis/${encodeURIComponent(s.symbol)}`}
            className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-panel-2/80 hover:text-accent transition-colors"
          >
            <span>{s.label}</span>
            <span className="font-mono text-xs text-muted">{s.symbol}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

interface DetailProps {
  symbol: string;
  range: (typeof RANGES)[number];
  rangeIdx: number;
  setRangeIdx: (i: number) => void;
}

function StockAnalysisDetail({ symbol, range, rangeIdx, setRangeIdx }: DetailProps) {
  const { data: quote, isLoading: quoteLoading } = useQuote(symbol);
  const { data: profile, isLoading: profileLoading } = useProfile(symbol);
  const { data: candles = [], isLoading: candlesLoading } = useHistory(
    symbol,
    range.range,
    range.interval
  );
  const liveTick = useStockTick(symbol);
  const { data: recs = [] } = useRecommendations({ symbol, limit: 1 });
  const latestRec = recs[0];

  const runAnalysis = useRunAnalysis();

  const price = liveTick?.price ?? quote?.price;
  const change = liveTick?.change ?? quote?.change;
  const changePct = liveTick?.change_percent ?? quote?.change_percent;
  const up = (changePct ?? 0) >= 0;

  async function onAnalyze() {
    toast(
      'info',
      'Running full multi-agent analysis…',
      'Watch the Live Agent Monitor below for real-time progress (~30–60s).'
    );
    try {
      const result = await runAnalysis.mutateAsync(symbol);
      toast(
        'success',
        `Analysis complete: ${(result.rating ?? result.action).replace('_', ' ').toUpperCase()}`,
        `${(result.confidence * 100).toFixed(0)}% confidence · ${(result.duration_ms / 1000).toFixed(1)}s`
      );
    } catch (err) {
      toast(
        'error',
        'Analysis failed',
        (err as Error)?.message ?? 'See agent logs for details'
      );
    }
  }

  // Use the profile's currency if known; defaults to USD.
  const ccy = profile?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between flex-wrap gap-4"
      >
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight font-mono">{symbol}</h1>
            {!quoteLoading && quote && (
              <div className="flex items-baseline gap-3">
                <span className="font-mono tabular-nums text-2xl">
                  {fmtMoney(price, ccy)}
                </span>
                <span
                  className={cn(
                    'flex items-center gap-1 font-mono tabular-nums text-sm',
                    up ? 'text-up' : 'text-down'
                  )}
                >
                  {up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {fmtMoney(change, ccy)} ({fmtPct(changePct)})
                </span>
              </div>
            )}
          </div>
          {!profileLoading && profile && (
            <p className="text-sm text-muted mt-1">
              {profile.name} · {profile.sector ?? '—'} · {profile.industry ?? '—'}
            </p>
          )}
        </div>

        <Button onClick={onAnalyze} disabled={runAnalysis.isPending} size="lg">
          <Sparkles className="h-4 w-4" />
          {runAnalysis.isPending ? 'Analyzing…' : 'Run full analysis'}
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Price chart</CardTitle>
              <Select
                value={String(rangeIdx)}
                onChange={(e) => setRangeIdx(Number(e.target.value))}
                className="h-8 text-xs"
              >
                {RANGES.map((r, i) => (
                  <option key={r.range} value={i}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {candlesLoading ? (
              <Skeleton className="w-full" style={{ height: 360 }} />
            ) : candles.length === 0 ? (
              <div className="min-h-[360px] flex flex-col items-center justify-center gap-4 py-8">
                <div className="text-center max-w-md">
                  <p className="text-sm text-muted">
                    No price data available for{' '}
                    <span className="font-mono text-text">{symbol}</span>.
                  </p>
                  <p className="text-xs text-muted mt-2">
                    Yahoo doesn't recognize this ticker. Indices need the <code>^</code>{' '}
                    prefix (e.g. <code>^NSEI</code> for NIFTY), and Indian stocks need{' '}
                    <code>.NS</code> or <code>.BO</code> suffix. Try one of these:
                  </p>
                </div>
                <SuggestionGrid />
              </div>
            ) : (
              <PriceChart
                candles={candles}
                symbol={symbol}
                interval={range.interval}
              />
            )}
          </CardContent>
        </Card>

        <ProfilePanel
          loading={profileLoading}
          profile={profile}
          quote={quote ?? undefined}
        />
      </div>

      {/* Live multi-agent progress — appears while an analysis is streaming. */}
      <AgentLiveMonitor symbol={symbol} />

      {latestRec && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Latest analysis</h2>
            <Badge variant="default" className="font-mono">
              {new Date(latestRec.created_at).toLocaleString()}
            </Badge>
          </div>
          <Tabs defaultValue={latestRec.report ? 'report' : 'summary'}>
            <TabsList>
              {latestRec.report && <TabsTrigger value="report">Report</TabsTrigger>}
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="trace">Trace</TabsTrigger>
            </TabsList>
            {latestRec.report && (
              <TabsContent value="report" className="mt-4">
                <ComprehensiveReport rec={latestRec} />
              </TabsContent>
            )}
            <TabsContent value="summary" className="mt-4">
              <RecommendationCard rec={latestRec} />
            </TabsContent>
            <TabsContent value="trace" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <AgentTraceGraph rec={latestRec} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function ProfilePanel({
  loading,
  profile,
  quote,
}: {
  loading: boolean;
  profile: ReturnType<typeof useProfile>['data'];
  quote: ReturnType<typeof useQuote>['data'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading ? (
          <>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : profile ? (
          <>
            <Row icon={<Building2 className="h-4 w-4" />} label="Sector" value={profile.sector ?? '—'} />
            <Row icon={<Building2 className="h-4 w-4" />} label="Industry" value={profile.industry ?? '—'} />
            <Row label="Market cap" value={fmtCompact(profile.market_cap ?? null)} mono />
            <Row label="Country" value={profile.country ?? '—'} />
            <Row label="Currency" value={profile.currency ?? '—'} />
            {profile.website && (
              <Row
                icon={<Globe className="h-4 w-4" />}
                label="Website"
                value={
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline truncate inline-block max-w-[140px]"
                  >
                    {profile.website.replace(/^https?:\/\//, '')}
                  </a>
                }
              />
            )}
            {quote && (
              <>
                <div className="border-t border-border pt-3 space-y-2">
                  <Row label="Day high" value={fmtMoney(quote.high, profile.currency ?? 'USD')} mono />
                  <Row label="Day low" value={fmtMoney(quote.low, profile.currency ?? 'USD')} mono />
                  <Row label="Open" value={fmtMoney(quote.open, profile.currency ?? 'USD')} mono />
                  <Row label="Prev close" value={fmtMoney(quote.previous_close, profile.currency ?? 'USD')} mono />
                  <Row label="Volume" value={fmtCompact(quote.volume ?? null)} mono />
                </div>
              </>
            )}
            {profile.description && (
              <CardDescription className="text-text/70 line-clamp-6">
                {profile.description}
              </CardDescription>
            )}
          </>
        ) : (
          <p className="text-muted">No profile data.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted text-xs uppercase tracking-wider">
        {icon}
        {label}
      </span>
      <span className={cn('text-sm', mono && 'font-mono tabular-nums')}>{value}</span>
    </div>
  );
}
