import type { ReactNode } from 'react';

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info' | 'count';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

/**
 * Canonical small pill label. `count` is the round number-badge style;
 * the rest are colored status labels. Renders `.badge .badge--{variant}`.
 */
export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span className={['badge', `badge--${variant}`, className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
