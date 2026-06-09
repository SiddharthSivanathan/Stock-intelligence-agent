/**
 * Universal stock search with live autocomplete.
 *
 * Hits the backend `/stocks/search?q=...` endpoint which queries the full
 * NSE master (2300+ stocks) plus US majors and indices. Falls back to the
 * client-side alias resolver if the backend is unreachable so typing
 * "NIFTY" or "AAPL" always navigates somewhere sensible.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { resolveSymbol } from '@/lib/symbols';

interface StockHit {
  symbol: string;
  base_symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
  currency: string | null;
}

export function SymbolSearch({ className }: { className?: string }) {
  const [value, setValue] = useState('');
  const [hits, setHits] = useState<StockHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Debounced search — fires 200ms after the user stops typing.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<StockHit[]>('/stocks/search', { params: { q, limit: 10 } })
        .then(({ data }) => {
          setHits(data);
          setActiveIdx(0);
        })
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [value]);

  // Click-outside → close dropdown.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function go(symbol: string) {
    navigate(`/analysis/${encodeURIComponent(symbol)}`);
    setValue('');
    setHits([]);
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Prefer the top backend hit; fall back to alias resolver if nothing matched.
    if (hits.length > 0) {
      go(hits[activeIdx]?.symbol ?? hits[0].symbol);
    } else {
      const resolved = resolveSymbol(value);
      if (resolved) go(resolved);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <form onSubmit={submit} className={className}>
      <div ref={containerRef} className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted z-10" />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search any NSE / BSE / US stock by name or symbol…"
          className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-panel-2/40 text-sm placeholder:text-muted focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/40"
          autoComplete="off"
        />

        {open && hits.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 max-h-96 overflow-y-auto rounded-md border border-border bg-panel shadow-2xl z-50">
            {hits.map((h, i) => (
              <button
                key={h.symbol}
                type="button"
                onClick={() => go(h.symbol)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm border-b border-border/40 last:border-0 ${
                  i === activeIdx ? 'bg-panel-2' : 'hover:bg-panel-2/60'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-text truncate">{h.name}</div>
                  <div className="text-xs text-muted truncate">
                    {h.sector ? `${h.sector} · ` : ''}
                    {h.exchange}
                  </div>
                </div>
                <code className="text-xs text-accent shrink-0">{h.symbol}</code>
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}
