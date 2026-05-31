import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border',
  {
    variants: {
      variant: {
        default: 'bg-panel-2 text-text border-border',
        bullish:
          'bg-accent/15 text-accent border-accent/30',
        bearish: 'bg-danger/15 text-danger border-danger/30',
        neutral: 'bg-muted/15 text-muted border-muted/30',
        warning: 'bg-warning/15 text-warning border-warning/30',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
