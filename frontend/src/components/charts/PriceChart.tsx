import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
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
import { bollinger, ema, sma, vwap, type Bar as IndBar } from '@/lib/indicators';

export interface IndicatorFlags {
  volume?: boolean;
  sma20?: boolean;
  sma50?: boolean;
  sma100?: boolean;
  sma200?: boolean;
  ema20?: boolean;
  ema50?: boolean;
  ema100?: boolean;
  ema200?: boolean;
  bb?: boolean;
  vwap?: boolean;
}

interface Props {
  candles: Candle[];
  symbol?: string;
  interval?: string;
  height?: number;
  indicators?: IndicatorFlags;
  markers?: SeriesMarker<Time>[];
  /** When false (market closed) the live "LIVE" dot never activates. */
  marketOpen?: boolean;
}

interface Bar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Convert yfinance-style interval ('1m','15m','1h','1d','1wk','3mo') -> seconds.
function intervalSeconds(interval: string): number {
  const m = interval.match(/^(\d+)(m|h|d|wk|mo)$/);
  if (!m) return 60;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case 'm':  return n * 60;
    case 'h':  return n * 3600;
    case 'd':  return n * 86_400;
    case 'wk': return n * 7 * 86_400;
    case 'mo': return n * 30 * 86_400;  // approximate
    default:   return 60;
  }
}

// MA colours (kept visually distinct; muted so price stays readable).
const MA_COLORS: Record<string, string> = {
  sma20: '#38bdf8', sma50: '#a78bfa', sma100: '#f59e0b', sma200: '#f43f5e',
  ema20: '#22d3ee', ema50: '#c084fc', ema100: '#fbbf24', ema200: '#fb7185',
};

export function PriceChart({
  candles,
  symbol,
  interval = '1d',
  height = 420,
  indicators = { volume: true },
  markers = [],
  marketOpen = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaysRef = useRef<ISeriesApi<'Line'>[]>([]);
  const lastBarRef = useRef<Bar | null>(null);
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);

  const wsConnected = useWsConnected();
  useSubscribe(symbol ? [symbol] : []);
  const tick = useStockTick(symbol);

  // Sorted/de-duped bar array — the single source for the candle series,
  // volume, and every indicator overlay.
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

  // -------- One-time chart setup --------
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'rgba(0, 0, 0, 0)' },
        textColor: '#7f8d9f',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: { vertLines: { color: '#1d2433' }, horzLines: { color: '#1d2433' } },
      rightPriceScale: { borderColor: '#252d40' },
      timeScale: { borderColor: '#252d40', timeVisible: true, rightOffset: 6 },
      crosshair: { mode: 1 },
      handleScroll: true,
      handleScale: true,
      height,
    });
    const series = chart.addCandlestickSeries({
      upColor: '#34c592', downColor: '#ef4868',
      borderUpColor: '#34c592', borderDownColor: '#ef4868',
      wickUpColor: '#27a577', wickDownColor: '#ee1f47',
    });
    const vol = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    seriesRef.current = series;
    volRef.current = vol;

    const ro = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volRef.current = null;
      overlaysRef.current = [];
      lastBarRef.current = null;
    };
  }, [height]);

  // -------- Candle data + fit --------
  useEffect(() => {
    if (!seriesRef.current) return;
    if (!bars.length) { lastBarRef.current = null; return; }
    seriesRef.current.setData(bars.map((b) => ({
      time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
    })));
    lastBarRef.current = bars[bars.length - 1]
      ? ({ ...bars[bars.length - 1] } as unknown as Bar)
      : null;
    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  // -------- Volume histogram --------
  useEffect(() => {
    if (!volRef.current) return;
    if (!indicators.volume || !bars.length) { volRef.current.setData([]); return; }
    volRef.current.setData(bars.map((b) => ({
      time: b.time,
      value: b.volume,
      color: b.close >= b.open ? 'rgba(52,197,146,0.5)' : 'rgba(239,72,104,0.5)',
    })));
  }, [bars, indicators.volume]);

  // -------- Indicator overlays (rebuilt on toggle / data change) --------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of overlaysRef.current) chart.removeSeries(s);
    overlaysRef.current = [];
    if (!bars.length) return;

    const addLine = (data: { time: UTCTimestamp; value: number }[], color: string, width = 1) => {
      if (!data.length) return;
      const s = chart.addLineSeries({
        color, lineWidth: width as 1 | 2 | 3 | 4,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      s.setData(data);
      overlaysRef.current.push(s);
    };

    (['sma20', 'sma50', 'sma100', 'sma200'] as const).forEach((k) => {
      if (indicators[k]) addLine(sma(bars, Number(k.slice(3))), MA_COLORS[k]);
    });
    (['ema20', 'ema50', 'ema100', 'ema200'] as const).forEach((k) => {
      if (indicators[k]) addLine(ema(bars, Number(k.slice(3))), MA_COLORS[k]);
    });
    if (indicators.bb) {
      const b = bollinger(bars, 20, 2);
      addLine(b.upper, 'rgba(148,163,184,0.7)');
      addLine(b.middle, 'rgba(148,163,184,0.4)');
      addLine(b.lower, 'rgba(148,163,184,0.7)');
    }
    if (indicators.vwap) addLine(vwap(bars, 20), '#eab308', 2);
  }, [bars, indicators]);

  // -------- Corporate-action markers --------
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setMarkers(markers ?? []);
  }, [markers, bars]);

  // -------- Live tick → roll the current candle forward --------
  useEffect(() => {
    if (!tick || !symbol || !seriesRef.current || !marketOpen) return;
    if (tick.symbol.toUpperCase() !== symbol.toUpperCase()) return;
    if (!Number.isFinite(tick.price)) return;

    const bucketSize = intervalSeconds(interval);
    const tickSec = Math.floor(new Date(tick.timestamp).getTime() / 1000);
    const bucketStart = (Math.floor(tickSec / bucketSize) * bucketSize) as UTCTimestamp;
    const last = lastBarRef.current;
    if (last && (bucketStart as number) < (last.time as number)) return;

    const nextBar: Bar = last && last.time === bucketStart
      ? { time: bucketStart, open: last.open, high: Math.max(last.high, tick.price), low: Math.min(last.low, tick.price), close: tick.price }
      : { time: bucketStart, open: tick.price, high: tick.price, low: tick.price, close: tick.price };
    try {
      seriesRef.current.update(nextBar);
      lastBarRef.current = nextBar;
      setLastTickAt(Date.now());
    } catch { /* ignore stale/ordered ticks */ }
  }, [tick, symbol, interval, marketOpen]);

  // -------- Toolbar actions --------
  const resetZoom = () => chartRef.current?.timeScale().fitContent();
  const screenshot = () => {
    const c = chartRef.current?.takeScreenshot();
    if (!c) return;
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `${symbol ?? 'chart'}-${interval}.png`;
    a.click();
  };
  const fullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const isLive = marketOpen && wsConnected && !!lastTickAt && Date.now() - lastTickAt < 30_000;

  return (
    <div ref={wrapRef} className="relative w-full bg-panel">
      <div ref={containerRef} className="w-full" style={{ height }} />

      {/* status badge */}
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

      {/* toolbar */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <ToolBtn onClick={resetZoom} title="Reset zoom (or double-click)"><RotateCcw className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={screenshot} title="Save screenshot (PNG)"><Camera className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn onClick={fullscreen} title="Fullscreen"><Maximize2 className="h-3.5 w-3.5" /></ToolBtn>
      </div>
    </div>
  );
}

function ToolBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="h-7 w-7 grid place-items-center rounded-md bg-panel/80 backdrop-blur border border-border text-muted hover:text-accent hover:border-accent/50 transition-colors"
    >
      {children}
    </button>
  );
}
