import { useWsConnected } from '@/hooks/useStockStream';
import { cn } from '@/lib/utils';

export function WsStatus() {
  const connected = useWsConnected();
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          connected ? 'bg-accent shadow-glow animate-pulse' : 'bg-danger'
        )}
      />
      <span>{connected ? 'Live' : 'Offline'}</span>
    </div>
  );
}
