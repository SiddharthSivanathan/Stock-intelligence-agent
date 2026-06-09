/**
 * Technical indicator math. Pure functions — the LLM never does numbers.
 * Uses the `technicalindicators` npm package for the heavy lifting.
 */
import {
  RSI,
  MACD,
  BollingerBands,
  SMA,
} from "technicalindicators";

export interface IndicatorSnapshot {
  rsi_14: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  bollinger_upper: number | null;
  bollinger_middle: number | null;
  bollinger_lower: number | null;
  close: number;
  volatility_30d_pct: number | null;
  max_drawdown_pct: number | null;
}

function last<T>(arr: T[]): T | null {
  return arr.length ? arr[arr.length - 1] : null;
}

export function computeIndicators(closes: number[]): IndicatorSnapshot | null {
  if (closes.length < 20) return null;

  const rsi = RSI.calculate({ values: closes, period: 14 });
  const sma20 = SMA.calculate({ values: closes, period: 20 });
  const sma50 = closes.length >= 50 ? SMA.calculate({ values: closes, period: 50 }) : [];
  const sma200 = closes.length >= 200 ? SMA.calculate({ values: closes, period: 200 }) : [];
  const macd = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const bb = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });

  // Daily returns → annualised volatility based on last 30 closes.
  const rets: number[] = [];
  const tail = closes.slice(-31);
  for (let i = 1; i < tail.length; i++) rets.push(tail[i] / tail[i - 1] - 1);
  const mean = rets.reduce((s, v) => s + v, 0) / Math.max(rets.length, 1);
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(rets.length, 1);
  const dailyStd = Math.sqrt(variance);
  const volPct = dailyStd ? dailyStd * Math.sqrt(252) * 100 : null;

  // Max drawdown over the full series.
  let peak = closes[0];
  let mdd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = (c - peak) / peak;
    if (dd < mdd) mdd = dd;
  }

  const lastMacd = last(macd);

  return {
    rsi_14: last(rsi),
    sma_20: last(sma20),
    sma_50: last(sma50),
    sma_200: last(sma200),
    macd: lastMacd?.MACD ?? null,
    macd_signal: lastMacd?.signal ?? null,
    macd_histogram: lastMacd?.histogram ?? null,
    bollinger_upper: last(bb)?.upper ?? null,
    bollinger_middle: last(bb)?.middle ?? null,
    bollinger_lower: last(bb)?.lower ?? null,
    close: closes[closes.length - 1],
    volatility_30d_pct: volPct,
    max_drawdown_pct: mdd * 100,
  };
}
