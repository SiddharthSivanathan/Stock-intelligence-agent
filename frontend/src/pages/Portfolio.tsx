import { useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, RotateCcw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePortfolio,
  useResetPortfolio,
  useTrade,
  useTradeHistory,
} from '@/hooks/api/usePortfolio';
import { toast } from '@/stores/toast';
import { cn, fmtMoney, fmtPct } from '@/lib/utils';
import { inferCurrency } from '@/lib/symbols';

export default function Portfolio() {
  const { data: snap, isLoading } = usePortfolio();
  const { data: trades = [] } = useTradeHistory(50);
  const reset = useResetPortfolio();

  async function onReset() {
    if (!confirm('Wipe positions and restore starting cash?')) return;
    try {
      await reset.mutateAsync();
      toast('success', 'Portfolio reset');
    } catch {
      toast('error', 'Reset failed');
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
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-accent" />
            Portfolio
          </h1>
          <p className="text-sm text-muted mt-1">
            Paper-trading sandbox. Trades execute at the live quote.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onReset} disabled={reset.isPending}>
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </motion.div>

      {isLoading || !snap ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile label="Total value" value={fmtMoney(snap.total_value)} mono />
          <KpiTile
            label="Total P&L"
            value={`${fmtMoney(snap.total_pnl)} (${fmtPct(snap.total_pnl_pct)})`}
            mono
            colorByValue={snap.total_pnl}
          />
          <KpiTile label="Cash" value={fmtMoney(snap.cash)} mono />
          <KpiTile label="Positions value" value={fmtMoney(snap.positions_value)} mono />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {!snap || snap.positions.length === 0 ? (
              <p className="text-sm text-muted py-6">
                No positions. Place a trade on the right to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted border-b border-border">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Symbol</th>
                      <th className="py-2 pr-3 font-medium text-right">Qty</th>
                      <th className="py-2 pr-3 font-medium text-right">Avg cost</th>
                      <th className="py-2 pr-3 font-medium text-right">Current</th>
                      <th className="py-2 pr-3 font-medium text-right">Value</th>
                      <th className="py-2 pr-3 font-medium text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.positions.map((p) => {
                      const up = p.pnl >= 0;
                      const ccy = p.currency ?? inferCurrency(p.symbol);
                      return (
                        <tr key={p.symbol} className="border-b border-border last:border-0">
                          <td className="py-2 pr-3 font-mono font-semibold">{p.symbol}</td>
                          <td className="py-2 pr-3 font-mono tabular-nums text-right">
                            {p.qty.toLocaleString(undefined, {
                              maximumFractionDigits: 4,
                            })}
                          </td>
                          <td className="py-2 pr-3 font-mono tabular-nums text-right">
                            {fmtMoney(p.avg_cost, ccy)}
                          </td>
                          <td className="py-2 pr-3 font-mono tabular-nums text-right">
                            {fmtMoney(p.current_price, ccy)}
                          </td>
                          <td className="py-2 pr-3 font-mono tabular-nums text-right">
                            {fmtMoney(p.market_value, ccy)}
                          </td>
                          <td
                            className={cn(
                              'py-2 pr-3 font-mono tabular-nums text-right',
                              up ? 'text-up' : 'text-down'
                            )}
                          >
                            {fmtMoney(p.pnl, ccy)} ({fmtPct(p.pnl_pct)})
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <TradeForm />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trade history</CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <p className="text-sm text-muted">No trades yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted border-b border-border">
                  <tr>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Symbol</th>
                    <th className="py-2 pr-3 font-medium">Side</th>
                    <th className="py-2 pr-3 font-medium text-right">Qty</th>
                    <th className="py-2 pr-3 font-medium text-right">Price</th>
                    <th className="py-2 pr-3 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => {
                    const tradeCcy = inferCurrency(t.symbol);
                    return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 text-muted text-xs font-mono">
                        {new Date(t.executed_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 font-mono font-semibold">{t.symbol}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            'uppercase text-xs font-semibold',
                            t.side === 'buy' ? 'text-up' : 'text-down'
                          )}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums text-right">
                        {t.qty}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums text-right">
                        {fmtMoney(t.price, tradeCcy)}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums text-right">
                        {fmtMoney(t.value, tradeCcy)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({
  label,
  value,
  mono,
  colorByValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  colorByValue?: number;
}) {
  const cls =
    colorByValue !== undefined
      ? colorByValue >= 0
        ? 'text-up'
        : 'text-down'
      : 'text-text';
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
        <div className={cn('text-xl mt-1', mono && 'font-mono tabular-nums', cls)}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function TradeForm() {
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('1');
  const trade = useTrade();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = parseFloat(qty);
    if (!symbol.trim() || !Number.isFinite(q) || q <= 0) return;
    try {
      const t = await trade.mutateAsync({
        symbol: symbol.trim().toUpperCase(),
        side,
        qty: q,
      });
      toast(
        'success',
        `${side.toUpperCase()} ${t.qty} ${t.symbol} @ ${fmtMoney(t.price, inferCurrency(t.symbol))}`
      );
      setQty('1');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string; detail?: string } } })?.response
          ?.data?.message ??
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Trade failed';
      toast('error', 'Trade failed', String(msg));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Place trade</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted uppercase tracking-wider">Symbol</label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="uppercase mt-1"
              maxLength={20}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted uppercase tracking-wider">Side</label>
              <Select
                value={side}
                onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}
                className="w-full mt-1"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted uppercase tracking-wider">Quantity</label>
              <Input
                type="number"
                step="any"
                min="0.0001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={trade.isPending || !symbol.trim()}
            variant={side === 'buy' ? 'primary' : 'danger'}
          >
            {trade.isPending ? 'Executing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol || '—'}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
