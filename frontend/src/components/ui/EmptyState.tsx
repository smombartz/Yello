import type { ReactNode } from 'react';
import { Icon } from '../Icon';

interface EmptyStateProps {
  /** Font Awesome icon name shown above the title */
  icon?: string;
  title: string;
  description?: ReactNode;
  /** Optional call-to-action, typically a button */
  action?: ReactNode;
  className?: string;
}

/**
 * Shared empty-state block: centered icon + title + description + optional CTA.
 * Replaces the ~16 per-view empty-state markups.
 */
export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`}>
      {icon && <Icon name={icon} className="empty-state-icon" />}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
