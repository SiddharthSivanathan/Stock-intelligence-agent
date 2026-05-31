import {
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  PolarAngleAxis,
} from 'recharts';

interface Props {
  /** Score in [-1, +1]. */
  score: number;
  label?: string;
  size?: number;
}

export function SentimentGauge({ score, label, size = 160 }: Props) {
  // Map score [-1, +1] -> [0, 100] for the bar's fill arc
  const pct = Math.round(((Math.max(-1, Math.min(1, score)) + 1) / 2) * 100);

  const color =
    score > 0.15
      ? 'hsl(158, 64%, 52%)'
      : score < -0.15
      ? 'hsl(350, 84%, 60%)'
      : 'hsl(215, 14%, 56%)';

  const data = [{ name: 'score', value: pct, fill: color }];

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div style={{ width: size, height: size }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={data}
            startAngle={210}
            endAngle={-30}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <RadialBar background={{ fill: 'hsl(222, 24%, 13%)' }} dataKey="value" cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
            {score > 0 ? '+' : ''}
            {score.toFixed(2)}
          </div>
          {label && <div className="text-[10px] uppercase tracking-wider text-muted mt-1">{label}</div>}
        </div>
      </div>
    </div>
  );
}
