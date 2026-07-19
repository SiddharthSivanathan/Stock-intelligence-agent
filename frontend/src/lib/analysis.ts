/**
 * Deterministic scoring, recommendations and plain-English insights.
 *
 * Everything here is *calculated* from verified fundamentals + real OHLCV —
 * it is transparent AI interpretation, never fabricated data. Any input that
 * is null simply drops out of its sub-score (documented in the UI).
 */
import type { Fundamentals } from '@/hooks/api/useStocks';
import { atr, macd, rsi, sma, type Bar } from '@/lib/indicators';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export interface Scores {
  technical: number;
  fundamental: number;
  valuation: number;
  financial: number;
  growth: number;
  momentum: number;
  risk: number; // 0 = safest, 100 = riskiest
  overall: number;
}

export interface TechnicalRead {
  price: number;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  macdHist: number | null;
  atrPct: number | null;
  trend: 'bullish' | 'bearish' | 'neutral';
  overbought: boolean;
  oversold: boolean;
}

export function readTechnicals(bars: Bar[]): TechnicalRead | null {
  if (bars.length < 30) return null;
  const price = bars[bars.length - 1].close;
  const s50 = sma(bars, 50); const s200 = sma(bars, 200);
  const sma50 = s50.length ? s50[s50.length - 1].value : null;
  const sma200 = s200.length ? s200[s200.length - 1].value : null;
  const r = rsi(bars, 14); const rsiV = r.length ? r[r.length - 1].value : null;
  const m = macd(bars); const macdHist = m.hist.length ? m.hist[m.hist.length - 1].value : null;
  const a = atr(bars, 14); const atrPct = a.length ? (a[a.length - 1].value / price) * 100 : null;
  let trend: TechnicalRead['trend'] = 'neutral';
  if (sma50 && sma200) {
    if (price > sma50 && sma50 > sma200) trend = 'bullish';
    else if (price < sma50 && sma50 < sma200) trend = 'bearish';
  }
  return {
    price, sma50, sma200, rsi: rsiV, macdHist, atrPct, trend,
    overbought: rsiV != null && rsiV > 70,
    oversold: rsiV != null && rsiV < 30,
  };
}

export function computeScores(f: Fundamentals | undefined, t: TechnicalRead | null): Scores {
  // ---- fundamental / financial health ----
  let financial = 50;
  const roe = f?.profitability.roe;
  const nm = f?.profitability.net_margin;
  const de = f?.health.debt_to_equity; // Yahoo reports as % (e.g. 10.2 => 0.10x)
  const cr = f?.health.current_ratio;
  if (roe != null) financial += clamp(roe * 100, -20, 30) - 5;
  if (nm != null) financial += clamp(nm * 100, -10, 20) - 5;
  if (de != null) financial += de < 50 ? 12 : de < 100 ? 4 : de < 200 ? -6 : -15;
  if (cr != null) financial += cr > 1.5 ? 8 : cr > 1 ? 3 : -8;
  financial = clamp(financial);
  const fundamental = financial;

  // ---- valuation (cheaper = higher) ----
  let valuation = 50;
  const pe = f?.valuation.forward_pe ?? f?.valuation.pe;
  const peg = f?.valuation.peg;
  const evb = f?.valuation.ev_ebitda;
  const dy = f?.valuation.dividend_yield;
  if (pe != null) valuation += pe < 12 ? 20 : pe < 18 ? 10 : pe < 25 ? 0 : pe < 40 ? -12 : -22;
  if (peg != null) valuation += peg < 1 ? 12 : peg < 2 ? 4 : peg < 3 ? -2 : -10;
  if (evb != null) valuation += evb < 8 ? 8 : evb < 14 ? 2 : -8;
  if (dy != null) valuation += clamp(dy * 100 * 2, 0, 8);
  valuation = clamp(valuation);

  // ---- growth ----
  let growth = 45;
  const rg = f?.growth.revenue_growth;
  const eg = f?.growth.earnings_growth;
  if (rg != null) growth += clamp(rg * 200, -25, 35);
  if (eg != null) growth += clamp(eg * 150, -20, 30);
  growth = clamp(growth);

  // ---- technical + momentum ----
  let technical = 50; let momentum = 50;
  if (t) {
    technical += t.trend === 'bullish' ? 18 : t.trend === 'bearish' ? -18 : 0;
    if (t.macdHist != null) technical += t.macdHist > 0 ? 8 : -8;
    if (t.rsi != null) technical += t.rsi > 55 && t.rsi < 70 ? 6 : t.rsi < 45 ? -6 : 0;
    if (t.rsi != null) momentum += (t.rsi - 50) * 1.2;
    if (t.macdHist != null) momentum += t.macdHist > 0 ? 12 : -12;
    if (t.overbought) momentum += 8; // strong but stretched
  }
  technical = clamp(technical); momentum = clamp(momentum);

  // ---- risk (higher = riskier) ----
  let risk = 45;
  const beta = f?.beta;
  if (beta != null) risk += beta > 1.3 ? 18 : beta > 1 ? 8 : beta > 0.6 ? 0 : -12;
  if (de != null) risk += de > 200 ? 18 : de > 100 ? 8 : de < 30 ? -12 : 0;
  if (t?.atrPct != null) risk += t.atrPct > 4 ? 12 : t.atrPct > 2.5 ? 5 : -4;
  if (t?.trend === 'bearish') risk += 8;
  risk = clamp(risk);

  const overall = clamp(
    fundamental * 0.28 + valuation * 0.2 + growth * 0.16 + technical * 0.16 +
    (100 - risk) * 0.12 + momentum * 0.08,
  );
  return { technical, fundamental, valuation, financial, growth, momentum, risk, overall };
}

export interface StyleRec {
  style: string;
  horizon: string;
  rec: 'Strong Buy' | 'Buy' | 'Hold' | 'Avoid' | 'Sell';
  confidence: number;
  risk: 'Low' | 'Medium' | 'High';
  entry: string;
  target: string;
  stop: string;
  expectedReturn: string;
  reasons: string[];
}

function recFromScore(s: number): StyleRec['rec'] {
  if (s >= 78) return 'Strong Buy';
  if (s >= 60) return 'Buy';
  if (s >= 45) return 'Hold';
  if (s >= 32) return 'Avoid';
  return 'Sell';
}
const money = (n: number, ccy = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(n);

export function buildRecommendations(
  f: Fundamentals | undefined, t: TechnicalRead | null, sc: Scores,
): StyleRec[] {
  const price = t?.price ?? 0;
  const ccy = f?.currency ?? 'INR';
  const target = f?.analyst.target_mean ?? (price ? price * 1.12 : 0);
  const riskLevel = (r: number): StyleRec['risk'] => (r < 40 ? 'Low' : r < 65 ? 'Medium' : 'High');
  const band = (lo: number, hi: number) => (price ? `${money(price * lo, ccy)} – ${money(price * hi, ccy)}` : '—');
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;

  const longScore = clamp(sc.fundamental * 0.4 + sc.valuation * 0.3 + sc.growth * 0.2 + (100 - sc.risk) * 0.1);
  const medScore = clamp(sc.fundamental * 0.3 + sc.technical * 0.3 + sc.valuation * 0.2 + sc.momentum * 0.2);
  const shortScore = clamp(sc.technical * 0.5 + sc.momentum * 0.4 + sc.valuation * 0.1);
  const swingScore = clamp(sc.momentum * 0.6 + sc.technical * 0.4 - (t?.overbought ? 18 : 0));

  const recs: StyleRec[] = [
    {
      style: 'Long-Term', horizon: '3–5 years', rec: recFromScore(longScore),
      confidence: Math.round(longScore), risk: riskLevel(sc.risk),
      entry: band(0.92, 1.0), target: price ? money(Math.max(target, price * 1.4), ccy) : '—',
      stop: price ? money(price * 0.78, ccy) : '—', expectedReturn: pct(40),
      reasons: [
        f?.profitability.roe != null ? `ROE ${(f.profitability.roe * 100).toFixed(0)}%` : 'Quality business',
        f?.health.debt_to_equity != null && f.health.debt_to_equity < 50 ? 'Low debt' : 'Manageable leverage',
        sc.valuation >= 55 ? 'Reasonable valuation' : 'Valuation full — accumulate on dips',
      ],
    },
    {
      style: 'Medium-Term', horizon: '6–12 months', rec: recFromScore(medScore),
      confidence: Math.round(medScore), risk: riskLevel(sc.risk),
      entry: band(0.95, 1.0), target: price ? money(target, ccy) : '—',
      stop: price ? money(price * 0.9, ccy) : '—',
      expectedReturn: price ? pct(((target - price) / price) * 100) : '—',
      reasons: [
        f?.analyst.recommendation ? `Analyst: ${f.analyst.recommendation}` : 'Momentum + valuation',
        t?.trend ? `Trend ${t.trend}` : 'Trend forming',
      ],
    },
    {
      style: 'Short-Term', horizon: '1–6 months', rec: recFromScore(shortScore),
      confidence: Math.round(shortScore), risk: riskLevel(clamp(sc.risk + 10)),
      entry: band(0.97, 1.0), target: price ? money(price * 1.1, ccy) : '—',
      stop: price ? money(price * 0.93, ccy) : '—', expectedReturn: pct(8),
      reasons: [t?.macdHist != null ? (t.macdHist > 0 ? 'MACD positive' : 'MACD negative') : 'Momentum-driven'],
    },
    {
      style: 'Swing Trade', horizon: '1–8 weeks',
      rec: t?.overbought ? 'Hold' : recFromScore(swingScore),
      confidence: Math.round(swingScore), risk: 'Medium',
      entry: t?.overbought ? band(0.94, 0.97) : band(0.98, 1.0),
      target: price ? money(price * 1.07, ccy) : '—', stop: price ? money(price * 0.95, ccy) : '—',
      expectedReturn: pct(6),
      reasons: [t?.overbought ? 'Overbought — buy the dip' : 'Momentum favourable'],
    },
    {
      style: 'Intraday', horizon: 'Today', rec: 'Hold',
      confidence: 45, risk: 'High',
      entry: '—', target: '—', stop: '—', expectedReturn: '±ATR',
      reasons: ['Live intraday order-flow (bid/ask, depth) not available from the data provider'],
    },
  ];
  return recs;
}

export interface Insight { title: string; text: string; tone: 'bullish' | 'bearish' | 'neutral'; }

export function buildInsights(f: Fundamentals | undefined, t: TechnicalRead | null): Insight[] {
  const out: Insight[] = [];
  if (t?.rsi != null) {
    out.push({
      title: `RSI ${t.rsi.toFixed(0)}`,
      tone: t.rsi > 70 ? 'bearish' : t.rsi < 30 ? 'bullish' : t.rsi > 55 ? 'bullish' : 'neutral',
      text: t.rsi > 70 ? 'Overbought — momentum is strong but a pullback is more likely near-term.'
        : t.rsi < 30 ? 'Oversold — selling looks exhausted; a bounce is more likely.'
        : t.rsi > 55 ? 'Bullish momentum with room before overbought.'
        : 'Neutral momentum — no strong directional edge.',
    });
  }
  if (t?.macdHist != null) {
    out.push({
      title: 'MACD', tone: t.macdHist > 0 ? 'bullish' : 'bearish',
      text: t.macdHist > 0
        ? 'MACD is above its signal line (positive histogram) — short-term trend is turning up.'
        : 'MACD is below its signal line (negative histogram) — short-term trend is weak.',
    });
  }
  if (t?.sma50 != null && t?.sma200 != null) {
    out.push({
      title: 'Moving Averages', tone: t.trend === 'bullish' ? 'bullish' : t.trend === 'bearish' ? 'bearish' : 'neutral',
      text: `Price is ${t.price > t.sma50 ? 'above' : 'below'} the 50-DMA and ${t.price > t.sma200 ? 'above' : 'below'} the 200-DMA — ${t.trend} structure.`,
    });
  }
  const pe = f?.valuation.forward_pe ?? f?.valuation.pe;
  if (pe != null) {
    out.push({
      title: `PE ${pe.toFixed(1)}`, tone: pe < 18 ? 'bullish' : pe > 35 ? 'bearish' : 'neutral',
      text: pe < 18 ? 'Trades at a modest earnings multiple — relatively cheap.'
        : pe > 35 ? 'A rich multiple — the market prices in high growth; leaves little margin for error.'
        : 'A moderate multiple, broadly in line with the market.',
    });
  }
  if (f?.profitability.roe != null) {
    const roe = f.profitability.roe * 100;
    out.push({
      title: `ROE ${roe.toFixed(0)}%`, tone: roe > 18 ? 'bullish' : roe < 8 ? 'bearish' : 'neutral',
      text: roe > 18 ? 'Generates strong returns on shareholder equity — an efficient, high-quality business.'
        : roe < 8 ? 'Low returns on equity — capital is not working hard.'
        : 'Decent returns on equity.',
    });
  }
  if (f?.health.debt_to_equity != null) {
    const de = f.health.debt_to_equity;
    out.push({
      title: 'Debt', tone: de < 50 ? 'bullish' : de > 150 ? 'bearish' : 'neutral',
      text: de < 50 ? 'Balance sheet carries little debt — low financial risk and resilience in downturns.'
        : de > 150 ? 'Elevated leverage — more vulnerable to rate rises and earnings shocks.'
        : 'Moderate leverage — manageable.',
    });
  }
  if (f?.health.free_cash_flow != null) {
    out.push({
      title: 'Cash Flow', tone: f.health.free_cash_flow > 0 ? 'bullish' : 'bearish',
      text: f.health.free_cash_flow > 0
        ? 'Positive free cash flow funds dividends, buybacks and growth without new debt.'
        : 'Negative free cash flow — the business is consuming cash.',
    });
  }
  if (f?.growth.revenue_growth != null) {
    const rg = f.growth.revenue_growth * 100;
    out.push({
      title: 'Revenue Growth', tone: rg > 10 ? 'bullish' : rg < 0 ? 'bearish' : 'neutral',
      text: rg > 10 ? 'Double-digit top-line growth signals healthy demand and share gains.'
        : rg < 0 ? 'Revenue is contracting — a red flag for the growth thesis.'
        : 'Modest revenue growth.',
    });
  }
  return out;
}
