import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { motion } from 'framer-motion';
import { Camera, Maximize2, RotateCcw } from 'lucide-react';
import type { Candle } from '@/hooks/api/useStocks';
import { useStockTick, useSubscribe, useWsConnected } from '@/hooks/useStockStream';
import {
  adx, atr, bollinger, cci, ema, fibLevels, ichimoku, macd, obv, rsi, sma,
  stochRsi, superTrend, vwap, williamsR, type Bar as IndBar,
} from '@/lib/indicators';

// ---- indicator flags (overlays + oscillator sub-panes) ----
export interface IndicatorFlags {
  // overlays on the main price pane
  sma20?: boolean; sma50?: boolean; sma100?: boolean; sma200?: boolean;
  ema20?: boolean; ema50?: boolean; ema100?: boolean; ema200?: boolean;
  bb?: boolean; vwap?: boolean; supertrend?: boolean; ichimoku?: boolean; fib?: boolean;
  // dedicated sub-panes
  volume?: boolean; rsi?: boolean; macd?: boolean; stoch?: boolean;
  cci?: boolean; williamsR?: boolean; adx?: boolean; atr?: boolean; obv?: boolean;
}

// Ordered list of possible sub-panes (rendered only when enabled).
const PANE_ORDER: (keyof IndicatorFlags)[] = ['volume', 'rsi', 'macd', 'stoch', 'cci', 'williamsR', 'adx', 'atr', 'obv'];
const PANE_HEIGHT = 120;

interface Props {
  candles: Candle[];
  symbol?: string;
  interval?: string;
  height?: number;
  indicators?: IndicatorFlags;
  markers?: SeriesMarker<Time>[];
  marketOpen?: boolean;
}
interface Bar { time: UTCTimestamp; open: number; high: number; low: number; close: number; }

function intervalSeconds(interval: string): number {
  const m = interval.match(/^(\d+)(m|h|d|wk|mo)$/);
  if (!m) return 60;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86_400;
    case 'wk': return n * 7 * 86_400;
    case 'mo': return n * 30 * 86_400;
    default: return 60;
  }
}

const MA_COLORS: Record<string, string> = {
  sma20: '#38bdf8', sma50: '#a78bfa', sma100: '#f59e0b', sma200: '#f43f5e',
  ema20: '#22d3ee', ema50: '#c084fc', ema100: '#fbbf24', ema200: '#fb7185',
};

const baseLayout = {
  layout: { background: { type: ColorType.Solid, color: 'rgba(0,0,0,0)' }, textColor: '#7f8d9f', fontFamily: 'JetBrains Mono, monospace' },
  grid: { vertLines: { color: '#161c28' }, horzLines: { color: '#161c28' } },
  rightPriceScale: { borderColor: '#252d40' },
  crosshair: { mode: 1 as const },
} as const;

// Keep zoom/pan in lock-step across every pane.
function linkTimeScales(charts: IChartApi[]) {
  let syncing = false;
  for (const src of charts) {
    src.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncing || !range) return;
      syncing = true;
      for (const c of charts) if (c !== src) c.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    });
  }
}

export function TradingChart({
  candles, symbol, interval = '1d', height = 440,
  indicators = { volume: true }, markers = [], marketOpen = true,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chartsRef = useRef<IChartApi[]>([]);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastBarRef = useRef<Bar | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);

  const wsConnected = useWsConnected();
  useSubscribe(symbol ? [symbol] : []);
  const tick = useStockTick(symbol);

  const bars = useMemo<IndBar[]>(() => {
    if (!candles?.length) return [];
    return candles
      .map((c) => ({
        time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
        open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number))
      .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time);
  }, [candles]);

  const activePanes = useMemo(() => PANE_ORDER.filter((k) => indicators[k]), [indicators]);

  // -------- Build (and rebuild) all panes on data / indicator change --------
  useEffect(() => {
    // teardown
    roRef.current?.disconnect();
    for (const c of chartsRef.current) c.remove();
    chartsRef.current = [];
    mainSeriesRef.current = null;
    if (!mainContainerRef.current || !bars.length) return;

    const hasPanes = activePanes.length > 0;
    const main = createChart(mainContainerRef.current, {
      ...baseLayout,
      timeScale: { borderColor: '#252d40', timeVisible: true, rightOffset: 6, visible: !hasPanes },
      height,
    });
    const candleSeries = main.addCandlestickSeries({
      upColor: '#34c592', downColor: '#ef4868', borderUpColor: '#34c592',
      borderDownColor: '#ef4868', wickUpColor: '#27a577', wickDownColor: '#ee1f47',
    });
    candleSeries.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    candleSeries.setMarkers(markers ?? []);
    mainSeriesRef.current = candleSeries;
    lastBarRef.current = { ...bars[bars.length - 1] } as unknown as Bar;

    const addOverlay = (data: { time: UTCTimestamp; value: number }[], color: string, width = 1) => {
      if (!data.length) return;
      const s = main.addLineSeries({ color, lineWidth: width as 1 | 2 | 3 | 4, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(data);
    };
    (['sma20', 'sma50', 'sma100', 'sma200'] as const).forEach((k) => { if (indicators[k]) addOverlay(sma(bars, +k.slice(3)), MA_COLORS[k]); });
    (['ema20', 'ema50', 'ema100', 'ema200'] as const).forEach((k) => { if (indicators[k]) addOverlay(ema(bars, +k.slice(3)), MA_COLORS[k]); });
    if (indicators.bb) { const b = bollinger(bars); addOverlay(b.upper, 'rgba(148,163,184,0.6)'); addOverlay(b.middle, 'rgba(148,163,184,0.35)'); addOverlay(b.lower, 'rgba(148,163,184,0.6)'); }
    if (indicators.vwap) addOverlay(vwap(bars, 20), '#eab308', 2);
    if (indicators.supertrend) {
      const st = superTrend(bars);
      const up = st.map((p) => ({ time: p.time, value: p.dir === 1 ? p.value : NaN }));
      const dn = st.map((p) => ({ time: p.time, value: p.dir === -1 ? p.value : NaN }));
      addOverlay(up.filter((p) => !isNaN(p.value)), '#22c55e', 2);
      addOverlay(dn.filter((p) => !isNaN(p.value)), '#ef4444', 2);
    }
    if (indicators.ichimoku) {
      const ich = ichimoku(bars);
      addOverlay(ich.conversion, '#38bdf8'); addOverlay(ich.baseLine, '#f43f5e');
      addOverlay(ich.leadA, 'rgba(52,197,146,0.5)'); addOverlay(ich.leadB, 'rgba(239,72,104,0.5)');
    }
    if (indicators.fib) {
      for (const lvl of fibLevels(bars)) {
        candleSeries.createPriceLine({ price: lvl.price, color: 'rgba(234,179,8,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${(lvl.ratio * 100).toFixed(1)}%` });
      }
    }

    const charts: IChartApi[] = [main];

    // sub-panes
    activePanes.forEach((pane, idx) => {
      const el = paneRefs.current[pane];
      if (!el) return;
      const isLast = idx === activePanes.length - 1;
      const chart = createChart(el, {
        ...baseLayout,
        timeScale: { borderColor: '#252d40', timeVisible: true, visible: isLast, rightOffset: 6 },
        height: PANE_HEIGHT,
      });
      const line = (data: { time: UTCTimestamp; value: number }[], color: string, w = 1) => {
        const s = chart.addLineSeries({ color, lineWidth: w as 1 | 2 | 3 | 4, priceLineVisible: false, lastValueVisible: true });
        s.setData(data); return s;
      };
      const guide = (s: ISeriesApi<'Line'>, price: number, color = 'rgba(127,141,159,0.4)') =>
        s.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });

      if (pane === 'volume') {
        const h = chart.addHistogramSeries({ priceFormat: { type: 'volume' } });
        h.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(52,197,146,0.5)' : 'rgba(239,72,104,0.5)' })));
        addOverlayLine(chart, sma(bars.map((b) => ({ ...b, close: b.volume })) as unknown as IndBar[], 20), '#eab308');
      } else if (pane === 'rsi') {
        const s = line(rsi(bars, 14), '#a78bfa'); guide(s, 70); guide(s, 30);
      } else if (pane === 'macd') {
        const m = macd(bars);
        const h = chart.addHistogramSeries({ priceFormat: { type: 'price' } });
        h.setData(m.hist);
        line(m.macd, '#38bdf8'); line(m.signal, '#f59e0b');
      } else if (pane === 'stoch') {
        const st = stochRsi(bars); const s = line(st.k, '#38bdf8'); line(st.d, '#f59e0b'); guide(s, 80); guide(s, 20);
      } else if (pane === 'cci') {
        const s = line(cci(bars), '#22d3ee'); guide(s, 100); guide(s, -100);
      } else if (pane === 'williamsR') {
        const s = line(williamsR(bars), '#c084fc'); guide(s, -20); guide(s, -80);
      } else if (pane === 'adx') {
        const a = adx(bars); const s = line(a.adx, '#eab308', 2); line(a.plusDI, '#22c55e'); line(a.minusDI, '#ef4444'); guide(s, 25);
      } else if (pane === 'atr') {
        line(atr(bars, 14), '#f59e0b');
      } else if (pane === 'obv') {
        line(obv(bars), '#38bdf8');
      }
      charts.push(chart);
    });

    linkTimeScales(charts);
    main.timeScale().fitContent();
    chartsRef.current = charts;

    // responsive width
    const ro = new ResizeObserver(() => {
      const w = mainContainerRef.current?.clientWidth;
      if (w) for (const c of charts) c.applyOptions({ width: w });
    });
    if (mainContainerRef.current) ro.observe(mainContainerRef.current);
    roRef.current = ro;

    return () => { ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, indicators, markers, height, activePanes.join(',')]);

  // -------- Live tick → roll current candle --------
  useEffect(() => {
    if (!tick || !symbol || !mainSeriesRef.current || !marketOpen) return;
    if (tick.symbol.toUpperCase() !== symbol.toUpperCase() || !Number.isFinite(tick.price)) return;
    const bucket = intervalSeconds(interval);
    const tickSec = Math.floor(new Date(tick.timestamp).getTime() / 1000);
    const start = (Math.floor(tickSec / bucket) * bucket) as UTCTimestamp;
    const last = lastBarRef.current;
    if (last && (start as number) < (last.time as number)) return;
    const next: Bar = last && last.time === start
      ? { time: start, open: last.open, high: Math.max(last.high, tick.price), low: Math.min(last.low, tick.price), close: tick.price }
      : { time: start, open: tick.price, high: tick.price, low: tick.price, close: tick.price };
    try { mainSeriesRef.current.update(next); lastBarRef.current = next; setLastTickAt(Date.now()); } catch { /* stale */ }
  }, [tick, symbol, interval, marketOpen]);

  const resetZoom = () => chartsRef.current[0]?.timeScale().fitContent();
  const screenshot = () => {
    const c = chartsRef.current[0]?.takeScreenshot();
    if (!c) return;
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png'); a.download = `${symbol ?? 'chart'}-${interval}.png`; a.click();
  };
  const fullscreen = () => {
    if (!rootRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen(); else rootRef.current.requestFullscreen?.();
  };

  const isLive = marketOpen && wsConnected && !!lastTickAt && Date.now() - lastTickAt < 30_000;

  return (
    <div ref={rootRef} className="relative w-full bg-panel">
      <div ref={mainContainerRef} className="w-full" style={{ height }} />
      {activePanes.map((p) => (
        <div key={p} className="relative w-full border-t border-border/50" style={{ height: PANE_HEIGHT }}
          ref={(el) => { paneRefs.current[p] = el; }}>
          <span className="absolute top-1 left-2 z-10 text-[10px] font-mono uppercase tracking-wider text-muted pointer-events-none">
            {p === 'williamsR' ? 'W%R' : p}
          </span>
        </div>
      ))}

      {symbol && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-md bg-panel/80 backdrop-blur px-2 py-1 border border-border">
          <motion.span
            animate={isLive ? { scale: [1, 1.35, 1], opacity: [1, 0.6, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={'inline-block h-2 w-2 rounded-full ' + (isLive ? 'bg-accent shadow-glow' : 'bg-muted')}
          />
          <span className="text-[10px] uppercase tracking-wider font-mono text-muted">
            {isLive ? 'live' : marketOpen ? (wsConnected ? 'waiting' : 'offline') : 'market closed'}
          </span>
        </div>
      )}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <ToolBtn onClick={resetZoom} title="Reset zoom (or double-click)"><RotateCcw className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={screenshot} title="Save screenshot (PNG)"><Camera className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={fullscreen} title="Fullscreen"><Maximize2 className="h-3.5 w-3.5" /></ToolBtn>
      </div>
    </div>
  );
}

// Helper used inside the volume pane for a volume moving-average overlay.
function addOverlayLine(chart: IChartApi, data: { time: UTCTimestamp; value: number }[], color: string) {
  if (!data.length) return;
  const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  s.setData(data);
}

function ToolBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="h-7 w-7 grid place-items-center rounded-md bg-panel/80 backdrop-blur border border-border text-muted hover:text-accent hover:border-accent/50 transition-colors">
      {children}
    </button>
  );
}
