import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';

/**
 * Each axis value is normalized to [0, 1] where 1 = "more risk".
 * Caller passes already-normalized values (we don't know the symbol's
 * specific norms here).
 */
export interface RadarMetric {
  axis: string;
  value: number; // 0..1
}

export function RiskRadar({ metrics, height = 280 }: { metrics: RadarMetric[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={metrics} outerRadius="75%">
        <PolarGrid stroke="hsl(222, 20%, 18%)" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: 'hsl(215, 14%, 56%)', fontSize: 11 }}
        />
        <PolarRadiusAxis
          domain={[0, 1]}
          tick={false}
          axisLine={false}
        />
        <Radar
          name="risk"
          dataKey="value"
          stroke="hsl(350, 84%, 60%)"
          fill="hsl(350, 84%, 60%)"
          fillOpacity={0.35}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/** Helper to turn raw risk indicators into 0..1 radar values. */
export function normalizeRiskIndicators(ind: Record<string, unknown>): RadarMetric[] {
  const vol = numOr(ind.volatility_annualized_pct, 0);   // pct, ~10..120
  const mdd = Math.abs(numOr(ind.max_drawdown_pct, 0));   // pct, 0..80
  const beta = numOr(ind.beta, 1);                        // 0..3
  const de = numOr(ind.debt_to_equity, 0);                // 0..400 (ratio sometimes shown *100)
  const cr = numOr(ind.current_ratio, 1.5);               // higher = safer; invert

  return [
    { axis: 'Volatility', value: clamp(vol / 80) },
    { axis: 'Drawdown', value: clamp(mdd / 60) },
    { axis: 'Beta', value: clamp(beta / 2.5) },
    { axis: 'Leverage', value: clamp(de / 200) },
    { axis: 'Liquidity risk', value: clamp(1 - cr / 3) },
  ];
}

function numOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
