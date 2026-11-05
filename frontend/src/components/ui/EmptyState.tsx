import type { ReactNode } from 'react';
import { Empty, Flex, Typography } from 'antd';
import { Icon, type IconName } from '../Icon';

interface EmptyStateProps {
  /** Icon shown above the title */
  icon?: IconName;
  title: string;
  description?: ReactNode;
  /** Optional call-to-action, typically a button */
  action?: ReactNode;
  className?: string;
}

/**
 * Shared empty-state block on Ant `Empty`: icon + title + description + optional CTA.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Empty
      className={className}
      image={icon ? <Icon name={icon} className="empty-state-icon" /> : Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <Flex vertical gap={4}>
          <Typography.Text strong>{title}</Typography.Text>
          {description && <Typography.Text type="secondary">{description}</Typography.Text>}
        </Flex>
      }
    >
      {action}
    </Empty>
  );
}
