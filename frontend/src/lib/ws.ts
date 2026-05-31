import { useAuthStore } from '@/stores/auth';
import { useStreamStore } from '@/stores/stream';
import { toast } from '@/stores/toast';

const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ||
  'ws://localhost:8000/api/v1/ws';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let manualClose = false;
let backoffMs = 1000;

export function connectWS(): void {
  const token = useAuthStore.getState().accessToken;
  if (!token) return;
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  manualClose = false;
  ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
  const store = useStreamStore.getState();

  ws.onopen = () => {
    store.setConnected(true);
    backoffMs = 1000;
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30_000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      const state = useStreamStore.getState();

      switch (msg.type) {
        case 'connected':
        case 'subscribed':
        case 'unsubscribed':
        case 'list':
          if (Array.isArray(msg.subscriptions)) {
            state.setSubscriptions(msg.subscriptions);
          }
          break;
        case 'price': {
          const d = msg.data ?? {};
          state.updatePrice({
            symbol: String(d.symbol ?? '').toUpperCase(),
            price: parseFloat(d.price),
            change: parseFloat(d.change),
            change_percent: parseFloat(d.change_percent),
            timestamp: d.timestamp,
            source: d.source,
            currency: d.currency,
          });
          break;
        }
        case 'alert':
          state.pushAlert(msg.data);
          toast(
            'warning',
            `${msg.data?.symbol ?? 'Alert'} triggered`,
            msg.data?.message
          );
          break;
        case 'pong':
        case 'error':
        default:
          // no-op
          break;
      }
    } catch {
      // ignore malformed frames
    }
  };

  ws.onclose = () => {
    store.setConnected(false);
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    ws = null;
    if (!manualClose) {
      // Exponential backoff capped at 30s
      reconnectTimer = setTimeout(() => {
        backoffMs = Math.min(backoffMs * 2, 30_000);
        connectWS();
      }, backoffMs);
    }
  };

  ws.onerror = () => {
    // onclose will fire next; nothing to do here.
  };
}

export function disconnectWS(): void {
  manualClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  useStreamStore.getState().setConnected(false);
}

export function wsSubscribe(symbols: string[]): void {
  if (ws?.readyState === WebSocket.OPEN && symbols.length) {
    ws.send(JSON.stringify({ action: 'subscribe', symbols }));
  }
}

export function wsUnsubscribe(symbols: string[]): void {
  if (ws?.readyState === WebSocket.OPEN && symbols.length) {
    ws.send(JSON.stringify({ action: 'unsubscribe', symbols }));
  }
}
