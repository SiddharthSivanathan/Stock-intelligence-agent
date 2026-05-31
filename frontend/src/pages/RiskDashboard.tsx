import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskRadar, normalizeRiskIndicators } from '@/components/charts/RiskRadar';
import { useInsights, type Insight } from '@/hooks/api/useInsights';

const RISK_VARIANT: Record<string, 'bullish' | 'neutral' | 'warning' | 'bearish'> = {
  low: 'bullish',
  moderate: 'neutral',
  elevated: 'warning',
  high: 'bearish',
  extreme: 'bearish',
};

export default function RiskDashboard() {
  const { data: insights = [], isLoading } = useInsights({
    agent: 'risk',
    limit: 30,
  });

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
          <ShieldAlert className="h-5 w-5 text-accent" />
          Risk
        </h1>
        <p className="text-sm text-muted mt-1">
          Volatility, drawdown, leverage, and liquidity by symbol.{' '}
          <span className="text-text/70">
            Risk Agent score is inverted: +1 = safe, −1 = risky.
          </span>
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-80 w-full" />
          ))}
        </div>
      ) : latest.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            No risk insights yet. Run{' '}
            <Link to="/analysis" className="text-accent hover:underline">
              full analysis
            </Link>{' '}
            or call <code>POST /agents/risk/run</code>.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {latest.map((i) => (
            <RiskTile key={i.id} insight={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function RiskTile({ insight }: { insight: Insight }) {
  const data = insight.data as Record<string, unknown>;
  const riskLevel = String(data.risk_level ?? 'moderate');
  const factors = Array.isArray(data.risk_factors) ? (data.risk_factors as string[]) : [];
  const indicators = (data.indicators as Record<string, unknown>) ?? {};
  const metrics = normalizeRiskIndicators(indicators);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono">{insight.symbol}</CardTitle>
          <Badge variant={RISK_VARIANT[riskLevel] ?? 'neutral'} className="capitalize">
            {riskLevel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <RiskRadar metrics={metrics} height={220} />

        <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
          <Stat
            label="Vol (ann.)"
            value={
              indicators.volatility_annualized_pct !== undefined
                ? `${Number(indicators.volatility_annualized_pct).toFixed(1)}%`
                : '—'
            }
          />
          <Stat
            label="Drawdown"
            value={
              indicators.max_drawdown_pct !== undefined
                ? `${Number(indicators.max_drawdown_pct).toFixed(1)}%`
                : '—'
            }
          />
          <Stat
            label="Beta"
            value={
              indicators.beta !== undefined && indicators.beta !== null
                ? Number(indicators.beta).toFixed(2)
                : '—'
            }
          />
        </div>

        {factors.length > 0 && (
          <ul className="text-xs text-text/80 space-y-1 list-disc pl-4">
            {factors.slice(0, 4).map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel-2/40 rounded-md border border-border p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted font-sans">
        {label}
      </div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  );
}
