import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { motion } from 'framer-motion';
import type { Candle } from '@/hooks/api/useStocks';
import { useStockTick, useSubscribe, useWsConnected } from '@/hooks/useStockStream';

interface Props {
  candles: Candle[];
  /** When set, the chart auto-subscribes to live WS ticks for this symbol
   *  and rolls the latest candle forward in real time. */
  symbol?: string;
  /** Candle interval string (e.g. '1m', '5m', '1h', '1d'). Used to compute
   *  the bucket boundary for live tick aggregation. */
  interval?: string;
  height?: number;
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

export function PriceChart({ candles, symbol, interval = '1d', height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastBarRef = useRef<Bar | null>(null);
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);

  const wsConnected = useWsConnected();
  // Auto-subscribe to this symbol's stream for as long as the chart is mounted.
  useSubscribe(symbol ? [symbol] : []);
  const tick = useStockTick(symbol);

  // -------- One-time chart setup --------
  useEffect(() => {
    if (!containerRef.current) return;
    // lightweight-charts color parser only supports #hex / rgb() / rgba().
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'rgba(0, 0, 0, 0)' },
        textColor: '#7f8d9f',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: '#1d2433' },
        horzLines: { color: '#1d2433' },
      },
      rightPriceScale: { borderColor: '#252d40' },
      timeScale: { borderColor: '#252d40', timeVisible: true },
      crosshair: { mode: 1 },
      height,
    });

    const series = chart.addCandlestickSeries({
      upColor: '#34c592',
      downColor: '#ef4868',
      borderUpColor: '#34c592',
      borderDownColor: '#ef4868',
      wickUpColor: '#27a577',
      wickDownColor: '#ee1f47',
    });

    chartRef.current = chart;
    seriesRef.current = series;

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
      lastBarRef.current = null;
    };
  }, [height]);

  // -------- Hydrate from history --------
  useEffect(() => {
    if (!seriesRef.current || !candles?.length) {
      lastBarRef.current = null;
      return;
    }
    const data = candles
      .map<Bar>((c) => ({
        time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number))
      .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time);

    seriesRef.current.setData(data);
    // Remember the most-recent bar — that's the candidate to merge live ticks into.
    lastBarRef.current = data[data.length - 1] ?? null;
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // -------- Live tick → roll the current candle forward --------
  useEffect(() => {
    if (!tick || !symbol || !seriesRef.current) return;
    if (tick.symbol.toUpperCase() !== symbol.toUpperCase()) return;
    if (!Number.isFinite(tick.price)) return;

    const bucketSize = intervalSeconds(interval);
    const tickSec = Math.floor(new Date(tick.timestamp).getTime() / 1000);
    const bucketStart = (Math.floor(tickSec / bucketSize) * bucketSize) as UTCTimestamp;

    const last = lastBarRef.current;
    // Defensive: don't try to write a bar older than the most recent one;
    // lightweight-charts requires strictly non-decreasing time.
    if (last && (bucketStart as number) < (last.time as number)) return;

    let nextBar: Bar;
    if (last && last.time === bucketStart) {
      // Same bucket — expand H/L, update close, keep open
      nextBar = {
        time: bucketStart,
        open: last.open,
        high: Math.max(last.high, tick.price),
        low: Math.min(last.low, tick.price),
        close: tick.price,
      };
    } else {
      // New bucket — start a fresh candle at the tick price
      nextBar = {
        time: bucketStart,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
      };
    }

    try {
      seriesRef.current.update(nextBar);
      lastBarRef.current = nextBar;
      setLastTickAt(Date.now());
    } catch {
      // lightweight-charts can throw if time ordering is wrong; ignore stale ticks
    }
  }, [tick, symbol, interval]);

  // "LIVE" is true if WS is connected AND we got a tick in the last 30s.
  const isLive = wsConnected && !!lastTickAt && Date.now() - lastTickAt < 30_000;

  return (
    <div className="relative w-full">
      <div ref={containerRef} className="w-full" style={{ height }} />
      {symbol && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-md bg-panel/80 backdrop-blur px-2 py-1 border border-border">
          <motion.span
            animate={isLive ? { scale: [1, 1.35, 1], opacity: [1, 0.6, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={
              'inline-block h-2 w-2 rounded-full ' +
              (isLive ? 'bg-accent shadow-glow' : 'bg-muted')
            }
          />
          <span className="text-[10px] uppercase tracking-wider font-mono text-muted">
            {isLive ? 'live' : wsConnected ? 'waiting' : 'offline'}
          </span>
        </div>
      )}
    </div>
  );
}
