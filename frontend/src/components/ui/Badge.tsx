import type { ReactNode } from 'react';
import { Tag } from 'antd';

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info' | 'count';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const TAG_COLOR: Record<Exclude<BadgeVariant, 'neutral' | 'count'>, string> = {
  brand: 'processing',
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'processing',
};

/**
 * Canonical small label on Ant `Tag`. `count` is the quiet number style;
 * the rest are coloured status labels.
 */
export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  if (variant === 'count') {
    return <Tag variant="filled" className={className}>{children}</Tag>;
  }
  return (
    <Tag color={variant === 'neutral' ? undefined : TAG_COLOR[variant]} className={className}>
      {children}
    </Tag>
  );
}
