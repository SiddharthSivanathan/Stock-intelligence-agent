import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Info, X, XCircle } from 'lucide-react';
import { useToastStore, type ToastKind } from '@/stores/toast';
import { cn } from '@/lib/utils';

const ICONS: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: Check,
  warning: AlertTriangle,
  error: XCircle,
};

const ACCENT: Record<ToastKind, string> = {
  info: 'border-accent/40 shadow-glow',
  success: 'border-accent/40 shadow-glow',
  warning: 'border-warning/40',
  error: 'border-danger/40 shadow-glow-danger',
};

const ICON_COLOR: Record<ToastKind, string> = {
  info: 'text-accent',
  success: 'text-accent',
  warning: 'text-warning',
  error: 'text-danger',
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className={cn(
                'pointer-events-auto rounded-lg border bg-panel/95 backdrop-blur-md p-3 flex items-start gap-3',
                ACCENT[t.kind]
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', ICON_COLOR[t.kind])} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight">{t.title}</div>
                {t.description && (
                  <div className="text-xs text-muted mt-1 break-words">
                    {t.description}
                  </div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-muted hover:text-text transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
