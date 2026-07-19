import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts';
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
import { TradingChart, type IndicatorFlags } from '@/components/charts/TradingChart';
import {
  AIScoresPanel, Collapsible, FinancialDashboard, InsightsPanel,
  PeerComparison, RecommendationsPanel,
} from '@/components/analysis/DashboardPanels';
import { buildRecommendations, computeScores, readTechnicals } from '@/lib/analysis';
import type { Bar } from '@/lib/indicators';
import { RecommendationCard } from '@/components/agents/RecommendationCard';
import { AgentTraceGraph } from '@/components/agents/AgentTraceGraph';
import { AgentLiveMonitor } from '@/components/agents/AgentLiveMonitor';
import { ComprehensiveReport } from '@/components/agents/ComprehensiveReport';
import {
  useCorporateActions,
  useFundamentals,
  useHistory,
  useMarketStatus,
  useProfile,
  useQuote,
} from '@/hooks/api/useStocks';
import { useRunAnalysis } from '@/hooks/api/useAgents';
import { useRecommendations } from '@/hooks/api/useRecommendations';
import { useStockTick } from '@/hooks/useStockStream';
import { cn, fmtCompact, fmtMoney, fmtPct } from '@/lib/utils';
import { toast } from '@/stores/toast';

// Range presets (TradingView/Yahoo-style). Each lists the intervals that are
// valid for that look-back (Yahoo caps intraday history: 1m→7d, others→60d,
// 1h→730d) and a sensible default interval.
interface RangeCfg {
  key: string;
  range: string;
  defaultInterval: string;
  intervals: string[];
}
const RANGES: RangeCfg[] = [
  { key: '1D',  range: '1d',  defaultInterval: '5m',  intervals: ['1m', '3m', '5m', '15m', '30m', '1h'] },
  { key: '5D',  range: '5d',  defaultInterval: '15m', intervals: ['1m', '3m', '5m', '15m', '30m', '1h'] },
  { key: '1M',  range: '1mo', defaultInterval: '1h',  intervals: ['30m', '1h', '2h', '4h', '1d'] },
  { key: '3M',  range: '3mo', defaultInterval: '1d',  intervals: ['1h', '2h', '4h', '1d'] },
  { key: '6M',  range: '6mo', defaultInterval: '1d',  intervals: ['4h', '1d', '1wk'] },
  { key: 'YTD', range: 'ytd', defaultInterval: '1d',  intervals: ['1d', '1wk'] },
  { key: '1Y',  range: '1y',  defaultInterval: '1d',  intervals: ['1d', '1wk'] },
  { key: '3Y',  range: '3y',  defaultInterval: '1d',  intervals: ['1d', '1wk', '1mo'] },
  { key: '5Y',  range: '5y',  defaultInterval: '1wk', intervals: ['1d', '1wk', '1mo'] },
  { key: '10Y', range: '10y', defaultInterval: '1wk', intervals: ['1wk', '1mo'] },
  { key: 'MAX', range: 'max', defaultInterval: '1mo', intervals: ['1wk', '1mo'] },
];
const INTERVAL_LABELS: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '2h': '2H', '4h': '4H', '1d': '1D', '1wk': '1W', '1mo': '1M',
};

const DEFAULT_RANGE_KEY = '1Y';
const LS = {
  range: 'sa.range', interval: 'sa.interval', indicators: 'sa.indicators',
};

const DEFAULT_INDICATORS: IndicatorFlags = {
  volume: true, sma50: true, sma200: true, rsi: true, macd: true,
};
// Overlays drawn on the price pane.
const OVERLAY_ROW: { key: keyof IndicatorFlags; label: string }[] = [
  { key: 'sma20', label: 'SMA 20' }, { key: 'sma50', label: 'SMA 50' },
  { key: 'sma100', label: 'SMA 100' }, { key: 'sma200', label: 'SMA 200' },
  { key: 'ema20', label: 'EMA 20' }, { key: 'ema50', label: 'EMA 50' },
  { key: 'ema100', label: 'EMA 100' }, { key: 'ema200', label: 'EMA 200' },
  { key: 'bb', label: 'Bollinger' }, { key: 'vwap', label: 'VWAP' },
  { key: 'supertrend', label: 'SuperTrend' }, { key: 'ichimoku', label: 'Ichimoku' },
  { key: 'fib', label: 'Fibonacci' },
];
// Dedicated sub-panes below the chart.
const PANE_ROW: { key: keyof IndicatorFlags; label: string }[] = [
  { key: 'volume', label: 'Volume' }, { key: 'rsi', label: 'RSI' },
  { key: 'macd', label: 'MACD' }, { key: 'stoch', label: 'Stoch RSI' },
  { key: 'cci', label: 'CCI' }, { key: 'williamsR', label: 'Williams %R' },
  { key: 'adx', label: 'ADX' }, { key: 'atr', label: 'ATR' }, { key: 'obv', label: 'OBV' },
];

function loadIndicators(): IndicatorFlags {
  try {
    const raw = localStorage.getItem(LS.indicators);
    if (raw) return JSON.parse(raw) as IndicatorFlags;
  } catch { /* ignore */ }
  return DEFAULT_INDICATORS;
}

export default function StockAnalysis() {
  const { symbol } = useParams<{ symbol?: string }>();
  // Resolve alias here too — handles bookmarked / shared URLs like /analysis/NIFTY.
  const sym = symbol ? resolveSymbol(symbol) : undefined;

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

  return <StockAnalysisDetail symbol={sym} />;
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

function StockAnalysisDetail({ symbol }: { symbol: string }) {
  // ---- persisted range / interval / indicators ----
  const [rangeKey, setRangeKey] = useState<string>(
    () => localStorage.getItem(LS.range) ?? DEFAULT_RANGE_KEY,
  );
  const rangeCfg =
    RANGES.find((r) => r.key === rangeKey) ??
    RANGES.find((r) => r.key === DEFAULT_RANGE_KEY)!;
  const [interval, setIntervalStr] = useState<string>(
    () => localStorage.getItem(LS.interval) ?? rangeCfg.defaultInterval,
  );
  const [indicators, setIndicators] = useState<IndicatorFlags>(loadIndicators);

  useEffect(() => { localStorage.setItem(LS.range, rangeKey); }, [rangeKey]);
  useEffect(() => { localStorage.setItem(LS.interval, interval); }, [interval]);
  useEffect(() => {
    localStorage.setItem(LS.indicators, JSON.stringify(indicators));
  }, [indicators]);

  function pickRange(key: string) {
    const cfg = RANGES.find((r) => r.key === key)!;
    setRangeKey(key);
    if (!cfg.intervals.includes(interval)) setIntervalStr(cfg.defaultInterval);
  }
  function toggleIndicator(key: keyof IndicatorFlags) {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const { data: quote, isLoading: quoteLoading } = useQuote(symbol);
  const { data: profile, isLoading: profileLoading } = useProfile(symbol);
  const { data: candles = [], isLoading: candlesLoading } = useHistory(
    symbol,
    rangeCfg.range,
    interval,
  );
  const { data: mktStatus } = useMarketStatus(symbol);
  const { data: corpActions = [] } = useCorporateActions(symbol, rangeCfg.range);
  const marketOpen = mktStatus?.status === 'open';

  const markers = useMemo<SeriesMarker<Time>[]>(
    () =>
      corpActions.map((a) => {
        const time = Math.floor(new Date(a.date).getTime() / 1000) as UTCTimestamp;
        if (a.type === 'dividend')
          return { time, position: 'belowBar', color: '#34c592', shape: 'circle', text: a.amount != null ? `Div ${a.amount}` : 'Div' };
        if (a.type === 'split')
          return { time, position: 'aboveBar', color: '#38bdf8', shape: 'square', text: a.label || 'Split' };
        return { time, position: 'aboveBar', color: '#eab308', shape: 'arrowDown', text: 'Earnings' };
      }) as SeriesMarker<Time>[],
    [corpActions],
  );

  // Dedicated daily series → stable technical scoring regardless of chart range.
  const { data: dailyCandles = [] } = useHistory(symbol, '1y', '1d');
  const analysisBars = useMemo<Bar[]>(
    () =>
      dailyCandles
        .map((c) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
          open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number)),
    [dailyCandles],
  );
  const { data: fundamentals } = useFundamentals(symbol);
  const tech = useMemo(() => readTechnicals(analysisBars), [analysisBars]);
  const scores = useMemo(() => computeScores(fundamentals, tech), [fundamentals, tech]);
  const styleRecs = useMemo(
    () => buildRecommendations(fundamentals, tech, scores),
    [fundamentals, tech, scores],
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
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CardTitle>Price chart</CardTitle>
                <MarketBadge status={mktStatus?.status} exchange={mktStatus?.exchange} />
              </div>
              {/* interval selector */}
              <Select
                value={interval}
                onChange={(e) => setIntervalStr(e.target.value)}
                className="h-8 text-xs w-24"
              >
                {rangeCfg.intervals.map((iv) => (
                  <option key={iv} value={iv}>{INTERVAL_LABELS[iv] ?? iv}</option>
                ))}
              </Select>
            </div>
            {/* range buttons */}
            <div className="flex items-center gap-1 flex-wrap">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => pickRange(r.key)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-mono transition-colors',
                    r.key === rangeKey
                      ? 'bg-accent/20 text-accent border border-accent/40'
                      : 'text-muted hover:text-text hover:bg-panel-2/60 border border-transparent',
                  )}
                >
                  {r.key}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {candlesLoading ? (
              <Skeleton className="w-full" style={{ height: 420 }} />
            ) : candles.length === 0 ? (
              <div className="min-h-[420px] flex flex-col items-center justify-center gap-4 py-8">
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
              <>
                <TradingChart
                  candles={candles}
                  symbol={symbol}
                  interval={interval}
                  indicators={indicators}
                  markers={markers}
                  marketOpen={marketOpen}
                />
                {/* indicator toggles */}
                <div className="space-y-1.5 pt-1">
                  <IndicatorRow label="Overlays" items={OVERLAY_ROW} indicators={indicators} onToggle={toggleIndicator} />
                  <IndicatorRow label="Panes" items={PANE_ROW} indicators={indicators} onToggle={toggleIndicator} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <ProfilePanel
          loading={profileLoading}
          profile={profile}
          quote={quote ?? undefined}
        />
      </div>

      {/* AI-driven dashboard */}
      <div className="space-y-4">
        <Collapsible id="scores" title="AI Investment Scores"
          subtitle="Calculated from verified fundamentals + live technicals — interpretation, not fabricated data">
          <AIScoresPanel scores={scores} />
        </Collapsible>
        <Collapsible id="recs" title="Recommendations by Style"
          subtitle="Long-term · Medium · Short · Swing · Intraday">
          <RecommendationsPanel recs={styleRecs} />
        </Collapsible>
        <Collapsible id="insights" title="AI Insights"
          subtitle="Plain-English explanation of each signal">
          <InsightsPanel f={fundamentals} tech={tech} />
        </Collapsible>
        {fundamentals && (
          <Collapsible id="fin" title="Financial Dashboard"
            subtitle={[fundamentals.sector, fundamentals.industry].filter(Boolean).join(' · ')}>
            <FinancialDashboard f={fundamentals} />
          </Collapsible>
        )}
        <Collapsible id="peers" title="Peer Comparison"
          subtitle="Normalized 1-year performance + key metrics">
          <PeerComparison symbol={symbol} />
        </Collapsible>
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

function IndicatorRow({ label, items, indicators, onToggle }: {
  label: string;
  items: { key: keyof IndicatorFlags; label: string }[];
  indicators: IndicatorFlags;
  onToggle: (k: keyof IndicatorFlags) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-muted w-14 shrink-0">{label}</span>
      {items.map(({ key, label: l }) => (
        <button
          key={key}
          type="button"
          onClick={() => onToggle(key)}
          className={cn(
            'px-2 py-0.5 rounded text-[11px] font-mono border transition-colors',
            indicators[key]
              ? 'bg-accent/15 text-accent border-accent/40'
              : 'text-muted border-border hover:text-text hover:border-muted',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function MarketBadge({ status, exchange }: { status?: string; exchange?: string | null }) {
  if (!status) return null;
  const open = status === 'open';
  const label = open ? 'Open' : status === 'pre' ? 'Pre-market' : status === 'post' ? 'Post-market' : 'Closed';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border',
        open ? 'text-accent border-accent/40 bg-accent/10' : 'text-muted border-border bg-panel-2/40',
      )}
      title={exchange ? `Exchange: ${exchange}` : undefined}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', open ? 'bg-accent' : 'bg-muted')} />
      {label}
    </span>
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
