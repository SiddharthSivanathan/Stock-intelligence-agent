import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { connectWS, disconnectWS } from '@/lib/ws';
import { useAuth } from '@/hooks/useAuth';

export function Shell() {
  const { accessToken } = useAuth();

  // Open the WS once we have a token; tear it down on unmount or logout.
  useEffect(() => {
    if (accessToken) {
      connectWS();
    }
    return () => disconnectWS();
  }, [accessToken]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
