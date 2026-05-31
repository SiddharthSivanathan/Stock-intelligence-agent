import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  Sparkles,
  Activity,
  LineChart,
  MessageSquare,
  Users,
  ShieldAlert,
  BellRing,
  Briefcase,
} from 'lucide-react';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/market', icon: TrendingUp, label: 'Market' },
  { to: '/insights', icon: Sparkles, label: 'AI Insights' },
  { to: '/agents', icon: Activity, label: 'Agent Monitor' },
  { to: '/analysis', icon: LineChart, label: 'Stock Analysis' },
  { to: '/chat', icon: MessageSquare, label: 'RAG Chat' },
  { to: '/sentiment', icon: Users, label: 'Sentiment' },
  { to: '/risk', icon: ShieldAlert, label: 'Risk' },
  { to: '/alerts', icon: BellRing, label: 'Alerts' },
  { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
] as const;

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-panel/40 backdrop-blur-md flex flex-col">
      <div className="h-16 px-5 flex items-center border-b border-border">
        <div className="h-8 w-8 rounded-md bg-accent shadow-glow mr-3 flex items-center justify-center font-bold text-bg">
          S
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Stock Intel</div>
          <div className="text-xs text-muted leading-tight">Multi-Agent AI</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-muted hover:text-text hover:bg-panel-2/60 [&.active]:bg-panel-2 [&.active]:text-text"
          >
            <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-accent shadow-glow opacity-0 group-[.active]:opacity-100 transition-opacity" />
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border text-xs text-muted">
        v1.0.0 — production
      </div>
    </aside>
  );
}
