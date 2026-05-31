import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from '@/components/layout/Shell';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { RouteErrorBoundary } from '@/components/layout/ErrorBoundary';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Dashboard from '@/pages/Dashboard';
import MarketOverview from '@/pages/MarketOverview';
import AIInsights from '@/pages/AIInsights';
import AgentMonitor from '@/pages/AgentMonitor';
import StockAnalysis from '@/pages/StockAnalysis';
import RAGChat from '@/pages/RAGChat';
import SentimentDashboard from '@/pages/SentimentDashboard';
import RiskDashboard from '@/pages/RiskDashboard';
import Alerts from '@/pages/Alerts';
import Portfolio from '@/pages/Portfolio';

export const router = createBrowserRouter([
  { path: '/login', element: <Login />, errorElement: <RouteErrorBoundary /> },
  { path: '/signup', element: <Signup />, errorElement: <RouteErrorBoundary /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Shell />
      </ProtectedRoute>
    ),
    // Catches render-time errors in any nested route (e.g. the HSL color bug).
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'market', element: <MarketOverview /> },
      { path: 'insights', element: <AIInsights /> },
      { path: 'agents', element: <AgentMonitor /> },
      { path: 'analysis', element: <StockAnalysis /> },
      { path: 'analysis/:symbol', element: <StockAnalysis /> },
      { path: 'chat', element: <RAGChat /> },
      { path: 'sentiment', element: <SentimentDashboard /> },
      { path: 'risk', element: <RiskDashboard /> },
      { path: 'alerts', element: <Alerts /> },
      { path: 'portfolio', element: <Portfolio /> },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
