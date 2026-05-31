import { useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WsStatus } from '@/components/status/WsStatus';
import { SymbolSearch } from '@/components/forms/SymbolSearch';
import { useAuth } from '@/hooks/useAuth';
import { disconnectWS } from '@/lib/ws';

export function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    disconnectWS();
    logout();
    navigate('/login');
  }

  return (
    <header className="h-16 shrink-0 px-6 flex items-center justify-between border-b border-border bg-panel/30 backdrop-blur-md">
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <SymbolSearch className="flex-1" />
      </div>

      <div className="flex items-center gap-4">
        <WsStatus />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-panel-2/60 border border-border">
          <User className="h-4 w-4 text-muted" />
          <span className="text-sm">{user?.email ?? 'guest'}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Logout">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
