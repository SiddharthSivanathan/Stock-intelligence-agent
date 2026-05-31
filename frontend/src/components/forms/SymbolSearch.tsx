import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { resolveSymbol } from '@/lib/symbols';

export function SymbolSearch({ className }: { className?: string }) {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Resolve user-typed aliases like NIFTY -> ^NSEI, SENSEX -> ^BSESN.
    const resolved = resolveSymbol(value);
    if (!resolved) return;
    navigate(`/analysis/${encodeURIComponent(resolved)}`);
    setValue('');
  }

  return (
    <form onSubmit={submit} className={className}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="Ticker, NIFTY, SENSEX, AAPL…"
          className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-panel-2/40 text-sm uppercase placeholder:text-muted placeholder:normal-case focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/40"
        />
      </div>
    </form>
  );
}
