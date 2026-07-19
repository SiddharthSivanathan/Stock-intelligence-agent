/**
 * Client-side technical-indicator math for the price chart.
 *
 * All functions take the chart's bar array ({ time, open, high, low, close,
 * volume }) and return lightweight-charts-friendly point arrays aligned to the
 * input bar times (leading warm-up bars are dropped).
 */
import type { UTCTimestamp } from 'lightweight-charts';

export interface Bar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface LinePoint {
  time: UTCTimestamp;
  value: number;
}
export interface HistPoint {
  time: UTCTimestamp;
  value: number;
  color: string;
}

const UP = 'rgba(52,197,146,0.7)';
const DOWN = 'rgba(239,72,104,0.7)';

// ---------------- Moving averages ----------------

export function sma(bars: Bar[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out.push({ time: bars[i].time, value: sum / period });
  }
  return out;
}

export function ema(bars: Bar[], period: number): LinePoint[] {
  if (bars.length < period) return [];
  const k = 2 / (period + 1);
  const out: LinePoint[] = [];
  let prev = bars.slice(0, period).reduce((a, b) => a + b.close, 0) / period;
  out.push({ time: bars[period - 1].time, value: prev });
  for (let i = period; i < bars.length; i++) {
    prev = bars[i].close * k + prev * (1 - k);
    out.push({ time: bars[i].time, value: prev });
  }
  return out;
}

// EMA over a plain number array, null during warm-up (used by MACD).
function emaArr(vals: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let e = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (i === period - 1) e = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
    else e = vals[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

// ---------------- Bollinger / VWAP ----------------

export function bollinger(bars: Bar[], period = 20, mult = 2): {
  upper: LinePoint[]; middle: LinePoint[]; lower: LinePoint[];
} {
  const upper: LinePoint[] = [], middle: LinePoint[] = [], lower: LinePoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b.close, 0) / period;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b.close - mean) ** 2, 0) / period);
    middle.push({ time: bars[i].time, value: mean });
    upper.push({ time: bars[i].time, value: mean + mult * sd });
    lower.push({ time: bars[i].time, value: mean - mult * sd });
  }
  return { upper, middle, lower };
}

export function vwap(bars: Bar[], period = 20): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let pv = 0, vv = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (bars[j].high + bars[j].low + bars[j].close) / 3;
      pv += tp * bars[j].volume;
      vv += bars[j].volume;
    }
    if (vv > 0) out.push({ time: bars[i].time, value: pv / vv });
  }
  return out;
}

// ---------------- Momentum ----------------

export function rsi(bars: Bar[], period = 14): LinePoint[] {
  if (bars.length <= period) return [];
  const out: LinePoint[] = [];
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = bars[i].close - bars[i - 1].close;
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / period, al = loss / period;
  const val = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out.push({ time: bars[period].time, value: val(ag, al) });
  for (let i = period + 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out.push({ time: bars[i].time, value: val(ag, al) });
  }
  return out;
}

export function macd(bars: Bar[], fast = 12, slow = 26, signalP = 9): {
  macd: LinePoint[]; signal: LinePoint[]; hist: HistPoint[];
} {
  const closes = bars.map((b) => b.close);
  const ef = emaArr(closes, fast), es = emaArr(closes, slow);
  const line = closes.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null));
  const defined = line.map((v, i) => ({ v, i })).filter((x) => x.v != null) as { v: number; i: number }[];
  const sig = emaArr(defined.map((d) => d.v), signalP);
  const sigByIdx = new Map<number, number>();
  defined.forEach((d, j) => { if (sig[j] != null) sigByIdx.set(d.i, sig[j] as number); });
  const macdPts: LinePoint[] = [], signalPts: LinePoint[] = [], hist: HistPoint[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (line[i] != null) macdPts.push({ time: bars[i].time, value: line[i] as number });
    const s = sigByIdx.get(i);
    if (s != null) {
      signalPts.push({ time: bars[i].time, value: s });
      const h = (line[i] as number) - s;
      hist.push({ time: bars[i].time, value: h, color: h >= 0 ? UP : DOWN });
    }
  }
  return { macd: macdPts, signal: signalPts, hist };
}

export function stochRsi(bars: Bar[], rsiP = 14, stochP = 14, kSmooth = 3, dSmooth = 3): {
  k: LinePoint[]; d: LinePoint[];
} {
  const r = rsi(bars, rsiP);
  const vals = r.map((p) => p.value);
  const kRaw: number[] = vals.map((_, i) => {
    if (i < stochP - 1) return NaN;
    const w = vals.slice(i - stochP + 1, i + 1);
    const mn = Math.min(...w), mx = Math.max(...w);
    return mx === mn ? 0 : ((vals[i] - mn) / (mx - mn)) * 100;
  });
  const smaAt = (arr: number[], p: number, idx: number) => {
    if (idx < p - 1) return NaN;
    let s = 0;
    for (let j = idx - p + 1; j <= idx; j++) { if (isNaN(arr[j])) return NaN; s += arr[j]; }
    return s / p;
  };
  const kSm = kRaw.map((_, i) => smaAt(kRaw, kSmooth, i));
  const dSm = kSm.map((_, i) => smaAt(kSm, dSmooth, i));
  const k: LinePoint[] = [], d: LinePoint[] = [];
  for (let i = 0; i < r.length; i++) {
    if (!isNaN(kSm[i])) k.push({ time: r[i].time, value: kSm[i] });
    if (!isNaN(dSm[i])) d.push({ time: r[i].time, value: dSm[i] });
  }
  return { k, d };
}

export function cci(bars: Bar[], period = 20): LinePoint[] {
  const out: LinePoint[] = [];
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  for (let i = period - 1; i < bars.length; i++) {
    const w = tp.slice(i - period + 1, i + 1);
    const mean = w.reduce((a, b) => a + b, 0) / period;
    const md = w.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
    out.push({ time: bars[i].time, value: md === 0 ? 0 : (tp[i] - mean) / (0.015 * md) });
  }
  return out;
}

export function williamsR(bars: Bar[], period = 14): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const w = bars.slice(i - period + 1, i + 1);
    const hh = Math.max(...w.map((b) => b.high)), ll = Math.min(...w.map((b) => b.low));
    out.push({ time: bars[i].time, value: hh === ll ? 0 : ((hh - bars[i].close) / (hh - ll)) * -100 });
  }
  return out;
}

// ---------------- Volatility / volume ----------------

export function atr(bars: Bar[], period = 14): LinePoint[] {
  if (bars.length <= period) return [];
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const out: LinePoint[] = [];
  let a = tr.slice(0, period).reduce((x, y) => x + y, 0) / period;
  out.push({ time: bars[period].time, value: a });
  for (let i = period; i < tr.length; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    out.push({ time: bars[i + 1].time, value: a });
  }
  return out;
}

export function obv(bars: Bar[]): LinePoint[] {
  if (!bars.length) return [];
  const out: LinePoint[] = [{ time: bars[0].time, value: 0 }];
  let o = 0;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) o += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) o -= bars[i].volume;
    out.push({ time: bars[i].time, value: o });
  }
  return out;
}

// ---------------- Trend ----------------

export function adx(bars: Bar[], period = 14): {
  adx: LinePoint[]; plusDI: LinePoint[]; minusDI: LinePoint[];
} {
  if (bars.length <= period * 2) return { adx: [], plusDI: [], minusDI: [] };
  const tr: number[] = [], pdm: number[] = [], mdm: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    pdm.push(up > down && up > 0 ? up : 0);
    mdm.push(down > up && down > 0 ? down : 0);
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing → arrays aligned so index i maps to bars[i + period].
  const smooth = (arr: number[]) => {
    const out: number[] = [];
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    out.push(s);
    for (let i = period; i < arr.length; i++) { s = s - s / period + arr[i]; out.push(s); }
    return out;
  };
  const trS = smooth(tr), pdmS = smooth(pdm), mdmS = smooth(mdm);
  const plusDI: LinePoint[] = [], minusDI: LinePoint[] = [], dx: number[] = [];
  for (let i = 0; i < trS.length; i++) {
    const barIdx = i + period;
    const pdi = trS[i] === 0 ? 0 : (100 * pdmS[i]) / trS[i];
    const mdi = trS[i] === 0 ? 0 : (100 * mdmS[i]) / trS[i];
    plusDI.push({ time: bars[barIdx].time, value: pdi });
    minusDI.push({ time: bars[barIdx].time, value: mdi });
    dx.push(pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi));
  }
  const adxPts: LinePoint[] = [];
  if (dx.length > period) {
    let a = dx.slice(0, period).reduce((x, y) => x + y, 0) / period;
    adxPts.push({ time: plusDI[period - 1].time, value: a });
    for (let i = period; i < dx.length; i++) {
      a = (a * (period - 1) + dx[i]) / period;
      adxPts.push({ time: plusDI[i].time, value: a });
    }
  }
  return { adx: adxPts, plusDI, minusDI };
}

export interface TrendPoint { time: UTCTimestamp; value: number; dir: 1 | -1; }

export function superTrend(bars: Bar[], period = 10, mult = 3): TrendPoint[] {
  const atrS = atr(bars, period);
  if (!atrS.length) return [];
  const atrMap = new Map(atrS.map((p) => [p.time as number, p.value]));
  const startIdx = bars.findIndex((b) => (b.time as number) === (atrS[0].time as number));
  const out: TrendPoint[] = [];
  let finalUpper = 0, finalLower = 0, st = 0;
  let dir: 1 | -1 = -1;
  for (let i = startIdx; i < bars.length; i++) {
    const a = atrMap.get(bars[i].time as number);
    if (a == null) continue;
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const basicUpper = hl2 + mult * a;
    const basicLower = hl2 - mult * a;
    const prevClose = bars[i - 1]?.close ?? bars[i].close;
    const pFinalUpper = finalUpper, pFinalLower = finalLower, prevST = st;
    finalUpper = i === startIdx || basicUpper < pFinalUpper || prevClose > pFinalUpper ? basicUpper : pFinalUpper;
    finalLower = i === startIdx || basicLower > pFinalLower || prevClose < pFinalLower ? basicLower : pFinalLower;
    if (i === startIdx) { st = finalUpper; dir = -1; }
    else {
      if (prevST === pFinalUpper) st = bars[i].close > finalUpper ? finalLower : finalUpper;
      else st = bars[i].close < finalLower ? finalUpper : finalLower;
      dir = st === finalLower ? 1 : -1;
    }
    out.push({ time: bars[i].time, value: st, dir });
  }
  return out;
}

export function ichimoku(bars: Bar[], conv = 9, base = 26, spanB = 52): {
  conversion: LinePoint[]; baseLine: LinePoint[]; leadA: LinePoint[]; leadB: LinePoint[];
} {
  const hh = (i: number, p: number) => Math.max(...bars.slice(i - p + 1, i + 1).map((b) => b.high));
  const ll = (i: number, p: number) => Math.min(...bars.slice(i - p + 1, i + 1).map((b) => b.low));
  const conversion: LinePoint[] = [], baseLine: LinePoint[] = [], leadA: LinePoint[] = [], leadB: LinePoint[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i >= conv - 1) conversion.push({ time: bars[i].time, value: (hh(i, conv) + ll(i, conv)) / 2 });
    if (i >= base - 1) {
      const b = (hh(i, base) + ll(i, base)) / 2;
      baseLine.push({ time: bars[i].time, value: b });
      const c = (hh(i, conv) + ll(i, conv)) / 2;
      leadA.push({ time: bars[i].time, value: (c + b) / 2 });
    }
    if (i >= spanB - 1) leadB.push({ time: bars[i].time, value: (hh(i, spanB) + ll(i, spanB)) / 2 });
  }
  // Note: spans are drawn at current time (no forward displacement) to keep the
  // time scale bounded to loaded bars.
  return { conversion, baseLine, leadA, leadB };
}

export interface FibLevel { ratio: number; price: number; }
export function fibLevels(bars: Bar[]): FibLevel[] {
  if (!bars.length) return [];
  const hi = Math.max(...bars.map((b) => b.high));
  const lo = Math.min(...bars.map((b) => b.low));
  const diff = hi - lo;
  return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => ({ ratio: r, price: hi - diff * r }));
}
