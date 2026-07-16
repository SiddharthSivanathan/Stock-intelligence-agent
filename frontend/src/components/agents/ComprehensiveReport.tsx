import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  Sparkles,
  Target,
  Newspaper,
  LineChart,
  Users,
  Building2,
  Gauge,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, fmtPct } from '@/lib/utils';
import type {
  ActionItem,
  ActionType,
  AnalysisResult,
  Rating,
} from '@/hooks/api/useAgents';

const RATING_META: Record<
  Rating,
  { label: string; variant: 'bullish' | 'bearish' | 'neutral' | 'warning'; ring: string }
> = {
  strong_buy: { label: 'Strong Buy', variant: 'bullish', ring: 'ring-accent/40' },
  buy: { label: 'Buy', variant: 'bullish', ring: 'ring-accent/30' },
  hold: { label: 'Hold', variant: 'neutral', ring: 'ring-border' },
  reduce: { label: 'Reduce', variant: 'warning', ring: 'ring-warning/40' },
  sell: { label: 'Sell', variant: 'bearish', ring: 'ring-danger/40' },
};

const ACTION_META: Record<ActionType, { label: string; Icon: typeof Target }> = {
  investment: { label: 'Investment', Icon: Target },
  risk_alert: { label: 'Risk Alert', Icon: ShieldAlert },
  growth_opportunity: { label: 'Growth', Icon: TrendingUp },
  competitive_threat: { label: 'Competitive Threat', Icon: Users },
  sector_trend: { label: 'Sector Trend', Icon: LineChart },
  technical_signal: { label: 'Technical Signal', Icon: LineChart },
  news_event: { label: 'News Event', Icon: Newspaper },
  earnings_impact: { label: 'Earnings', Icon: Gauge },
  watchlist: { label: 'Watchlist', Icon: Sparkles },
  portfolio: { label: 'Portfolio', Icon: Building2 },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children || (typeof children === 'string' && !children.trim())) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted">{title}</div>
      <p className="text-sm leading-relaxed text-text/85">{children}</p>
    </div>
  );
}

function BulletList({
  items,
  tone,
}: {
  items: string[];
  tone: 'up' | 'down' | 'accent' | 'warn';
}) {
  if (!items?.length) return null;
  const dot =
    tone === 'down'
      ? 'bg-danger'
      : tone === 'warn'
      ? 'bg-warning'
      : 'bg-accent';
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm text-text/85">
          <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 66 ? 'bg-accent' : v >= 40 ? 'bg-warning' : 'bg-danger';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono tabular-nums text-text">{Math.round(v)}/100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-panel-2">
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: `${v}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </div>
  );
}

function ActionCard({ a }: { a: ActionItem }) {
  const meta = ACTION_META[a.type] ?? ACTION_META.investment;
  const { Icon } = meta;
  return (
    <div className="rounded-md border border-border bg-panel-2/40 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{a.title}</span>
            <span className="shrink-0 font-mono text-[11px] text-muted">
              {fmtPct(a.confidence * 100)}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">
            {meta.label}
          </div>
          {a.detail && <p className="mt-1 text-xs text-text/75">{a.detail}</p>}
        </div>
      </div>
    </div>
  );
}

/** Renders the full explainable company report from a completed analysis. */
export function ComprehensiveReport({ rec }: { rec: AnalysisResult }) {
  const r = rec.report;
  if (!r) return null;
  const rating = RATING_META[rec.rating] ?? RATING_META.hold;
  const RatingIcon =
    rec.rating === 'strong_buy' || rec.rating === 'buy'
      ? TrendingUp
      : rec.rating === 'sell' || rec.rating === 'reduce'
      ? TrendingDown
      : Minus;

  return (
    <div className="space-y-5">
      {/* Degradation notice — shown when the report is partial. */}
      {rec.warnings && rec.warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-medium">Partial report.</span>{' '}
            {rec.warnings.join(' ')}
          </div>
        </div>
      )}

      {/* Verdict banner */}
      <Card className={cn('ring-1', rating.ring)}>
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-panel-2">
              <RatingIcon className="h-6 w-6 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={rating.variant} className="px-3 py-0.5 text-base">
                  {rating.label}
                </Badge>
                <span className="font-mono text-xs text-muted">{rec.symbol}</span>
              </div>
              <p className="mt-1 max-w-xl text-sm text-text/80">{rec.summary}</p>
            </div>
          </div>
          <div className="flex gap-6 sm:flex-col sm:gap-1 sm:text-right">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">Confidence</div>
              <div className="font-mono text-lg tabular-nums">{fmtPct(rec.confidence * 100)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive summary + scores */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Executive Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-text/85">{r.executive_summary}</p>
            <Section title="AI Reasoning">{rec.reasoning}</Section>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScoreBar label="Financial Health" value={r.financial_health_score} />
            <ScoreBar label="Overall Conviction" value={(rec.score + 1) * 50} />
            <ScoreBar label="Confidence" value={rec.confidence * 100} />
          </CardContent>
        </Card>
      </div>

      {/* Actionable recommendations */}
      {rec.actions?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRight className="h-4 w-4 text-accent" /> Actionable Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {rec.actions.map((a, i) => (
              <ActionCard key={i} a={a} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* SWOT */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SWOT Analysis</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-accent/25 bg-accent/5 p-3">
            <div className="mb-2 text-xs font-semibold text-up">Strengths</div>
            <BulletList items={r.swot?.strengths ?? []} tone="up" />
          </div>
          <div className="rounded-md border border-danger/25 bg-danger/5 p-3">
            <div className="mb-2 text-xs font-semibold text-down">Weaknesses</div>
            <BulletList items={r.swot?.weaknesses ?? []} tone="down" />
          </div>
          <div className="rounded-md border border-accent/25 bg-accent/5 p-3">
            <div className="mb-2 text-xs font-semibold text-accent">Opportunities</div>
            <BulletList items={r.swot?.opportunities ?? []} tone="accent" />
          </div>
          <div className="rounded-md border border-warning/25 bg-warning/5 p-3">
            <div className="mb-2 text-xs font-semibold text-warning">Threats</div>
            <BulletList items={r.swot?.threats ?? []} tone="warn" />
          </div>
        </CardContent>
      </Card>

      {/* Detailed analysis grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Business & Industry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Section title="Business Overview">{r.business_overview}</Section>
            <Section title="Competitive Position">{r.competitive_position}</Section>
            <Section title="Industry & Sector">{r.industry_analysis}</Section>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Section title="Growth Potential">{r.growth_potential}</Section>
            <Section title="Profitability">{r.profitability}</Section>
            <Section title="Valuation">{r.valuation}</Section>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Market & Signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Section title="Technical Summary">{r.technical_summary}</Section>
            <Section title="Market Sentiment">{r.sentiment_summary}</Section>
            <Section title="News Impact">{r.news_impact}</Section>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risk & Outlook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Section title="Risk Assessment">{r.risk_assessment}</Section>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Section title="Short-Term Outlook">{r.short_term_outlook}</Section>
              <Section title="Long-Term Outlook">{r.long_term_outlook}</Section>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key points */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-up">Key Strengths</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={r.key_strengths ?? []} tone="up" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-down">Key Weaknesses</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={r.key_weaknesses ?? []} tone="down" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-accent">Opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={r.opportunities ?? []} tone="accent" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-warning">Potential Risks</CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={r.risks ?? []} tone="warn" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
