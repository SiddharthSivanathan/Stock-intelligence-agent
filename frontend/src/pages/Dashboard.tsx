import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Eye, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WatchlistAddForm } from '@/components/forms/WatchlistAddForm';
import {
  useWatchlist,
  useRemoveFromWatchlist,
} from '@/hooks/api/useWatchlist';
import { useWatchlistQuotes } from '@/hooks/api/useStocks';
import { useStreamStore } from '@/stores/stream';
import { useAuth } from '@/hooks/useAuth';
import { cn, fmtMoney, fmtPct } from '@/lib/utils';
import { toast } from '@/stores/toast';

export default function Dashboard() {
  const { user } = useAuth();
  const { data: watchlist = [] } = useWatchlist();
  const { data: quotes = [], isLoading } = useWatchlistQuotes();
  const removeFromWatchlist = useRemoveFromWatchlist();
  // Select stable references only — derive (slice) at render time.
  // Returning a new array from the selector triggers React 18's
  // "getSnapshot should be cached to avoid an infinite loop" error.
  const allAlerts = useStreamStore((s) => s.recentAlerts);
  const livePrices = useStreamStore((s) => s.prices);
  const liveAlerts = allAlerts.slice(0, 6);

  // Merge live ticks over REST snapshot
  const enriched = quotes.map((q) => {
    const live = livePrices[q.symbol];
    return live ? { ...q, ...live } : q;
  });

  async function onRemove(symbol: string) {
    try {
      await removeFromWatchlist.mutateAsync(symbol);
      toast('success', `Removed ${symbol}`);
    } catch {
      toast('error', `Failed to remove ${symbol}`);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between flex-wrap gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-muted mt-1">
            {watchlist.length} symbol{watchlist.length === 1 ? '' : 's'} on your
            watchlist · streaming live every 15s
          </p>
        </div>
        <WatchlistAddForm />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted" />
              Watchlist
            </CardTitle>
          </CardHeader>
          <CardContent>
            {watchlist.length === 0 ? (
              <p className="text-sm text-muted py-6">
                Your watchlist is empty. Add a symbol above.
              </p>
            ) : isLoading ? (
              <div className="space-y-2 py-1">
                {watchlist.slice(0, 4).map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <div className="flex items-center gap-6">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {enriched.map((q) => {
                  const up = q.change_percent >= 0;
                  return (
                    <motion.div
                      key={q.symbol}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0 group"
                    >
                      <Link
                        to={`/analysis/${q.symbol}`}
                        className="flex-1 hover:text-accent transition-colors"
                      >
                        <div className="font-semibold">{q.symbol}</div>
                        <div className="text-xs text-muted">{q.source ?? '—'}</div>
                      </Link>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemove(q.symbol)}
                          aria-label={`Remove ${q.symbol}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {liveAlerts.length === 0 ? (
              <p className="text-sm text-muted py-6">
                No live alerts yet. Create rules under{' '}
                <Link to="/alerts" className="text-accent hover:underline">
                  Alerts
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-3">
                {liveAlerts.map((a, i) => (
                  <li
                    key={`${a.rule_id}-${a.fired_at}-${i}`}
                    className="text-sm flex items-start gap-3"
                  >
                    <Badge variant="warning">{a.symbol}</Badge>
                    <span className="flex-1">{a.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
