import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAddToWatchlist } from '@/hooks/api/useWatchlist';
import { toast } from '@/stores/toast';

export function WatchlistAddForm() {
  const [symbol, setSymbol] = useState('');
  const add = useAddToWatchlist();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    try {
      await add.mutateAsync({ symbol: s });
      toast('success', `Added ${s} to watchlist`);
      setSymbol('');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string; detail?: string } } })
          ?.response?.data?.message ??
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ??
        'Failed to add symbol';
      toast('error', `Could not add ${s}`, String(msg));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2 items-center">
      <Input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        placeholder="Add ticker (e.g. TSLA)"
        className="h-9 max-w-xs uppercase"
        maxLength={20}
      />
      <Button type="submit" size="sm" disabled={add.isPending || !symbol.trim()}>
        <Plus className="h-4 w-4" />
        {add.isPending ? 'Adding…' : 'Add'}
      </Button>
    </form>
  );
}
