import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SymbolSearch } from '@/components/forms/SymbolSearch';
import { useQuote, useWatchlistQuotes, type Quote } from '@/hooks/api/useStocks';
import { useStreamStore } from '@/stores/stream';
import { wsSubscribe, wsUnsubscribe } from '@/lib/ws';
import { cn, fmtMoney, fmtPct } from '@/lib/utils';

const INDICES = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI'] as const;

export default function MarketOverview() {
  const { data: watchQuotes = [] } = useWatchlistQuotes();
  const livePrices = useStreamStore((s) => s.prices);

  // Top movers from watchlist
  const movers = useMemo(() => {
    const merged = watchQuotes.map((q) => {
      const live = livePrices[q.symbol];
      return live ? { ...q, ...live } : q;
    });
    return [...merged].sort(
      (a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent)
    );
  }, [watchQuotes, livePrices]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between flex-wrap gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-accent" />
            Market Overview
          </h1>
          <p className="text-sm text-muted mt-1">
            Index ETFs, top movers from your watchlist, and quick drill-in.
          </p>
        </div>
        <SymbolSearch className="w-full max-w-xs" />
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle>Indices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {INDICES.map((sym) => (
              <IndexTile key={sym} symbol={sym} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top movers (your watchlist)</CardTitle>
        </CardHeader>
        <CardContent>
          {movers.length === 0 ? (
            <p className="text-sm text-muted">Add symbols to your watchlist to see movers.</p>
          ) : (
            <div className="divide-y divide-border">
              {movers.slice(0, 10).map((q) => {
                const up = q.change_percent >= 0;
                return (
                  <Link
                    to={`/analysis/${q.symbol}`}
                    key={q.symbol}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:text-accent transition-colors"
                  >
                    <div>
                      <div className="font-semibold font-mono">{q.symbol}</div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="font-mono tabular-nums text-right">
                        {fmtMoney(q.price, q.currency ?? 'USD')}
                      </div>
                      <div
                        className={cn(
                          'flex items-center gap-1 font-mono tabular-nums text-sm w-24 justify-end',
                          up ? 'text-up' : 'text-down'
                        )}
                      >
                        {up ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4" />
                        )}
                        {fmtPct(q.change_percent)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IndexTile({ symbol }: { symbol: string }) {
  const { data: quote, isLoading } = useQuote(symbol);
  const live = useStreamStore((s) => s.prices[symbol]);

  // Subscribe to live ticks for indices while this tile is mounted
  useEffect(() => {
    wsSubscribe([symbol]);
    return () => wsUnsubscribe([symbol]);
  }, [symbol]);

  const data: Partial<Quote> | undefined = live ?? quote ?? undefined;
  if (isLoading || !data) {
    return <Skeleton className="h-20 w-full" />;
  }
  const changePct = data.change_percent ?? 0;
  const up = changePct >= 0;
  return (
    <Link
      to={`/analysis/${symbol}`}
      className="block border border-border rounded-md p-3 bg-panel-2/40 hover:border-accent/40 transition-colors"
    >
      <div className="text-xs text-muted font-mono">{symbol}</div>
      <div className="font-mono tabular-nums text-lg mt-0.5">
        {fmtMoney(data.price, data.currency ?? 'USD')}
      </div>
      <div
        className={cn(
          'flex items-center gap-1 text-xs font-mono mt-1',
          up ? 'text-up' : 'text-down'
        )}
      >
        {up ? (
          <ArrowUpRight className="h-3 w-3" />
        ) : (
          <ArrowDownRight className="h-3 w-3" />
        )}
        {fmtPct(changePct)}
      </div>
      <Badge variant={up ? 'bullish' : 'bearish'} className="mt-2 text-[10px]">
        {up ? 'up' : 'down'}
      </Badge>
    </Link>
  );
}
