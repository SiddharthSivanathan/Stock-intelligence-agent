import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * React Router renders this when any route — protected or not — throws.
 * Catches:
 *   - Lazy-loaded chunk failures
 *   - Render-time TypeErrors / unhandled exceptions
 *   - 4xx / 5xx Response throws from loaders
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = 'Something went wrong';
  let detail = 'An unexpected error happened while rendering this page.';
  let traceback: string | null = null;

  if (isRouteErrorResponse(error)) {
    title = `${error.status} · ${error.statusText}`;
    detail = (error.data && String(error.data)) || detail;
  } else if (error instanceof Error) {
    detail = error.message;
    traceback = error.stack ?? null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="glass max-w-2xl w-full">
        <CardContent className="py-10 space-y-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-warning shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-sm text-muted mt-1">{detail}</p>
            </div>
          </div>

          {traceback && (
            <details className="text-xs bg-panel-2/60 border border-border rounded-md">
              <summary className="cursor-pointer px-3 py-2 text-muted">
                Stack trace
              </summary>
              <pre className="px-3 pb-3 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-text/70">
                {traceback}
              </pre>
            </details>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
              <RotateCcw className="h-4 w-4" />
              Go back
            </Button>
            <Button size="sm" onClick={() => navigate('/dashboard')}>
              <Home className="h-4 w-4" />
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
