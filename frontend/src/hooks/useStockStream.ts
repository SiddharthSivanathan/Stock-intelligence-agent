import { useEffect } from 'react';
import { useStreamStore, type PriceTick } from '@/stores/stream';
import { wsSubscribe, wsUnsubscribe } from '@/lib/ws';

/** Returns the latest tick for a symbol (or undefined if none yet). */
export function useStockTick(symbol: string | undefined): PriceTick | undefined {
  return useStreamStore((s) => (symbol ? s.prices[symbol.toUpperCase()] : undefined));
}

/** Subscribe to a set of symbols for the lifetime of the component. */
export function useSubscribe(symbols: string[]) {
  useEffect(() => {
    if (!symbols.length) return;
    wsSubscribe(symbols);
    return () => wsUnsubscribe(symbols);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')]);
}

/** Quick read of WS connection status. */
export function useWsConnected(): boolean {
  return useStreamStore((s) => s.connected);
}
