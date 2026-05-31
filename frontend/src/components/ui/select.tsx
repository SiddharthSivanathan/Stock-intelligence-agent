import * as React from 'react';
import { cn } from '@/lib/utils';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-10 rounded-md border border-border bg-panel-2/60 px-3 text-sm text-text',
      'focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';
