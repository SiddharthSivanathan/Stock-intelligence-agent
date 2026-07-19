import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { createChart, ColorType, type UTCTimestamp } from 'lightweight-charts';
import { ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, fmtCompact } from '@/lib/utils';
import {
  useCompare, type Candle, type Fundamentals, type PeerMetric,
} from '@/hooks/api/useStocks';
import {
  buildInsights, type Scores, type StyleRec, type TechnicalRead,
} from '@/lib/analysis';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// ---------- shared helpers ----------
const pctR = (v: number | null | undefined, dp = 1) =>
  v == null ? 'Data N/A' : `${(v * 100).toFixed(dp)}%`;
const num = (v: number | null | undefined, dp = 2) =>
  v == null ? 'Data N/A' : v.toFixed(dp);
const cur = (v: number | null | undefined, ccy = 'INR') =>
  v == null ? 'Data N/A' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: ccy, notation: 'compact', maximumFractionDigits: 2 }).format(v);

export function Collapsible({ title, subtitle, id, defaultOpen = true, children }: {
  title: string; subtitle?: string; id: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const key = `sa.sec.${id}`;
  const [open, setOpen] = useState(() => {
    const s = localStorage.getItem(key);
    return s == null ? defaultOpen : s === '1';
  });
  useEffect(() => { localStorage.setItem(key, open ? '1' : '0'); }, [key, open]);
  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 px-2 rounded bg-panel-2/30">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <span className="text-sm font-mono tabular-nums">{value}</span>
    </div>
  );
}

// ================= AI Scores =================
function ScoreBar({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  // invert: for risk, high value = bad (red)
  const good = invert ? 100 - value : value;
  const color = good >= 70 ? 'bg-accent' : good >= 45 ? 'bg-warning' : 'bg-danger';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-panel-2 overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function AIScoresPanel({ scores }: { scores: Scores }) {
  const verdict = scores.overall >= 70 ? 'Strong' : scores.overall >= 55 ? 'Positive' : scores.overall >= 45 ? 'Neutral' : 'Weak';
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="flex flex-col items-center justify-center gap-1 md:border-r md:border-border">
        <div className="text-5xl font-bold font-mono tabular-nums text-accent">{Math.round(scores.overall)}</div>
        <div className="text-xs uppercase tracking-wider text-muted">Overall Investment Score</div>
        <div className="text-sm font-semibold mt-1">{verdict}</div>
      </div>
      <div className="md:col-span-2 grid grid-cols-2 gap-x-6 gap-y-3">
        <ScoreBar label="Fundamental" value={scores.fundamental} />
        <ScoreBar label="Valuation" value={scores.valuation} />
        <ScoreBar label="Financial Health" value={scores.financial} />
        <ScoreBar label="Growth" value={scores.growth} />
        <ScoreBar label="Technical" value={scores.technical} />
        <ScoreBar label="Momentum" value={scores.momentum} />
        <ScoreBar label="Risk (↓ better)" value={scores.risk} invert />
      </div>
    </div>
  );
}

// ================= Financial Dashboard =================
export function FinancialDashboard({ f }: { f: Fundamentals }) {
  const ccy = f.currency ?? 'INR';
  const v = f.valuation, p = f.profitability, h = f.health, g = f.growth;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Valuation</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="PE" value={num(v.pe)} />
          <Metric label="Forward PE" value={num(v.forward_pe)} />
          <Metric label="PEG" value={num(v.peg)} />
          <Metric label="P/B" value={num(v.pb)} />
          <Metric label="P/S" value={num(v.ps)} />
          <Metric label="EV/EBITDA" value={num(v.ev_ebitda)} />
          <Metric label="Div Yield" value={pctR(v.dividend_yield, 2)} />
          <Metric label="EPS (ttm)" value={num(v.eps_trailing)} />
        </div>
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Profitability & Returns</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="Gross Margin" value={pctR(p.gross_margin)} />
          <Metric label="Oper Margin" value={pctR(p.operating_margin)} />
          <Metric label="EBITDA Margin" value={pctR(p.ebitda_margin)} />
          <Metric label="Net Margin" value={pctR(p.net_margin)} />
          <Metric label="ROE" value={pctR(p.roe)} />
          <Metric label="ROA" value={pctR(p.roa)} />
          <Metric label="Book Value" value={num(v.book_value)} />
          <Metric label="Beta" value={num(f.beta)} />
        </div>
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Financial Health & Growth</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="Debt/Equity" value={h.debt_to_equity == null ? 'Data N/A' : `${(h.debt_to_equity / 100).toFixed(2)}x`} />
          <Metric label="Current Ratio" value={num(h.current_ratio)} />
          <Metric label="Quick Ratio" value={num(h.quick_ratio)} />
          <Metric label="Free Cash Flow" value={cur(h.free_cash_flow, ccy)} />
          <Metric label="Op Cash Flow" value={cur(h.operating_cash_flow, ccy)} />
          <Metric label="Total Debt" value={cur(h.total_debt, ccy)} />
          <Metric label="Rev Growth" value={pctR(g.revenue_growth)} />
          <Metric label="Earnings Growth" value={pctR(g.earnings_growth)} />
        </div>
      </div>
      {f.income_statement.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-2">Income Statement (annual)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs">
                  <th className="text-left font-normal py-1">FY</th>
                  <th className="text-right font-normal py-1">Revenue</th>
                  <th className="text-right font-normal py-1">Net Income</th>
                  <th className="text-right font-normal py-1">Net Margin</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {f.income_statement.map((r) => (
                  <tr key={r.fy ?? Math.random()} className="border-t border-border/40">
                    <td className="text-left py-1">{r.fy ?? '—'}</td>
                    <td className="text-right py-1">{cur(r.revenue, ccy)}</td>
                    <td className="text-right py-1">{cur(r.net_income, ccy)}</td>
                    <td className="text-right py-1">
                      {r.revenue && r.net_income ? `${((r.net_income / r.revenue) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted mt-2">
            Balance-sheet & cash-flow 5-yr history and detailed shareholding are not exposed by the
            connected provider → shown as "Data N/A" where applicable.
          </p>
        </div>
      )}
    </div>
  );
}

// ================= Insights =================
export function InsightsPanel({ f, tech }: { f?: Fundamentals; tech: TechnicalRead | null }) {
  const insights = useMemo(() => buildInsights(f, tech), [f, tech]);
  const dot = (t: string) => (t === 'bullish' ? 'text-up' : t === 'bearish' ? 'text-down' : 'text-muted');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {insights.map((i) => (
        <div key={i.title} className="flex gap-3 p-3 rounded-md bg-panel-2/30 border border-border/50">
          <span className={cn('mt-0.5 text-lg leading-none', dot(i.tone))}>●</span>
          <div>
            <div className="text-sm font-semibold">{i.title}</div>
            <div className="text-xs text-muted mt-0.5">{i.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ================= Recommendations =================
export function RecommendationsPanel({ recs }: { recs: StyleRec[] }) {
  const recColor = (r: string) =>
    r.includes('Strong Buy') ? 'text-up' : r === 'Buy' ? 'text-up' : r === 'Hold' ? 'text-warning' : 'text-down';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted text-xs">
            {['Style', 'Horizon', 'Call', 'Conf.', 'Risk', 'Entry', 'Target', 'Stop', 'Exp. Return', 'Rationale'].map((h) => (
              <th key={h} className="text-left font-normal py-1.5 px-2 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recs.map((r) => (
            <tr key={r.style} className="border-t border-border/40 align-top">
              <td className="py-2 px-2 font-medium whitespace-nowrap">{r.style}</td>
              <td className="py-2 px-2 text-muted whitespace-nowrap">{r.horizon}</td>
              <td className={cn('py-2 px-2 font-semibold whitespace-nowrap', recColor(r.rec))}>{r.rec}</td>
              <td className="py-2 px-2 font-mono">{r.confidence}%</td>
              <td className="py-2 px-2 whitespace-nowrap">{r.risk}</td>
              <td className="py-2 px-2 font-mono whitespace-nowrap text-xs">{r.entry}</td>
              <td className="py-2 px-2 font-mono whitespace-nowrap text-xs">{r.target}</td>
              <td className="py-2 px-2 font-mono whitespace-nowrap text-xs">{r.stop}</td>
              <td className="py-2 px-2 font-mono whitespace-nowrap text-xs">{r.expectedReturn}</td>
              <td className="py-2 px-2 text-xs text-muted">{r.reasons.join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ================= Peer Comparison =================
const PEER_GROUPS: Record<string, string[]> = {
  'TCS.NS': ['TCS.NS', 'INFY.NS', 'HCLTECH.NS', 'WIPRO.NS', 'TECHM.NS'],
  'INFY.NS': ['INFY.NS', 'TCS.NS', 'HCLTECH.NS', 'WIPRO.NS', 'TECHM.NS'],
  'HCLTECH.NS': ['HCLTECH.NS', 'TCS.NS', 'INFY.NS', 'WIPRO.NS', 'TECHM.NS'],
  'WIPRO.NS': ['WIPRO.NS', 'TCS.NS', 'INFY.NS', 'HCLTECH.NS', 'TECHM.NS'],
  'TECHM.NS': ['TECHM.NS', 'TCS.NS', 'INFY.NS', 'HCLTECH.NS', 'WIPRO.NS'],
  AAPL: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],
  MSFT: ['MSFT', 'AAPL', 'GOOGL', 'AMZN', 'NVDA'],
  TSLA: ['TSLA', 'F', 'GM', 'RIVN', 'LCID'],
  NVDA: ['NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM'],
};

function peersFor(symbol: string): string[] {
  return PEER_GROUPS[symbol.toUpperCase()] ?? [];
}

const PALETTE = ['#34c592', '#38bdf8', '#f59e0b', '#a78bfa', '#f43f5e'];

function NormalizedChart({ symbols }: { symbols: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const results = useQueries({
    queries: symbols.map((s) => ({
      queryKey: ['history', s, '1y', '1d'],
      queryFn: async () => {
        const { data } = await api.get<Candle[]>(`/stocks/${s}/history`, { params: { range: '1y', interval: '1d' } });
        return data;
      },
      staleTime: 30 * 60_000,
    })),
  });
  const ready = results.every((r) => r.data);
  useEffect(() => {
    if (!ref.current || !ready) return;
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: 'rgba(0,0,0,0)' }, textColor: '#7f8d9f', fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: '#161c28' }, horzLines: { color: '#161c28' } },
      rightPriceScale: { borderColor: '#252d40' },
      timeScale: { borderColor: '#252d40', timeVisible: false },
      crosshair: { mode: 1 },
      height: 260,
    });
    results.forEach((r, i) => {
      const candles = (r.data ?? []) as Candle[];
      if (!candles.length) return;
      const base = candles[0].close || 1;
      const s = chart.addLineSeries({ color: PALETTE[i % PALETTE.length], lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: symbols[i] });
      s.setData(candles.map((c) => ({
        time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
        value: ((c.close - base) / base) * 100,
      })));
    });
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }); });
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, [ready, symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <Skeleton className="w-full" style={{ height: 260 }} />;
  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-2">
        {symbols.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="font-mono">{s}</span>
          </span>
        ))}
      </div>
      <div ref={ref} className="w-full" />
      <p className="text-[11px] text-muted mt-1">Normalized total price return over the last year (rebased to 0%).</p>
    </div>
  );
}

export function PeerComparison({ symbol }: { symbol: string }) {
  const peers = peersFor(symbol);
  const { data: rows = [], isLoading } = useCompare(peers);
  if (!peers.length) {
    return <p className="text-sm text-muted">Peer comparison is not configured for this symbol.</p>;
  }
  if (isLoading) return <Skeleton className="w-full" style={{ height: 200 }} />;
  const cell = (v: number | null | undefined, kind: 'pct' | 'num' | 'cap') =>
    v == null ? '—' : kind === 'pct' ? `${(v * 100).toFixed(1)}%` : kind === 'cap' ? fmtCompact(v) : v.toFixed(2);
  return (
    <div className="space-y-5">
      <NormalizedChart symbols={peers} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs">
              {['Company', 'Mkt Cap', 'PE', 'Fwd PE', 'P/B', 'ROE', 'Net Mgn', 'Rev Grw', 'EPS Grw', 'D/E', 'Div', 'View'].map((h) => (
                <th key={h} className="text-left font-normal py-1.5 px-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map((r: PeerMetric) => {
              const isSelf = r.symbol.toUpperCase() === symbol.toUpperCase();
              return (
                <tr key={r.symbol} className={cn('border-t border-border/40', isSelf && 'bg-accent/10')}>
                  <td className="py-1.5 px-2 whitespace-nowrap font-sans">
                    <span className={cn('font-medium', isSelf && 'text-accent')}>{r.symbol}</span>
                  </td>
                  <td className="py-1.5 px-2">{cell(r.market_cap, 'cap')}</td>
                  <td className="py-1.5 px-2">{cell(r.pe, 'num')}</td>
                  <td className="py-1.5 px-2">{cell(r.forward_pe, 'num')}</td>
                  <td className="py-1.5 px-2">{cell(r.pb, 'num')}</td>
                  <td className="py-1.5 px-2">{cell(r.roe, 'pct')}</td>
                  <td className="py-1.5 px-2">{cell(r.net_margin, 'pct')}</td>
                  <td className="py-1.5 px-2">{cell(r.revenue_growth, 'pct')}</td>
                  <td className="py-1.5 px-2">{cell(r.earnings_growth, 'pct')}</td>
                  <td className="py-1.5 px-2">{r.debt_to_equity == null ? '—' : (r.debt_to_equity / 100).toFixed(2)}</td>
                  <td className="py-1.5 px-2">{cell(r.dividend_yield, 'pct')}</td>
                  <td className="py-1.5 px-2 font-sans capitalize">{r.recommendation ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
