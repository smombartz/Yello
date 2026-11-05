import { Flex, Spin, Typography } from 'antd';

interface LoadingSpinnerProps {
  /** Size of the spinner in pixels. Default: 40 */
  size?: number;
  /** Optional message to display below the spinner */
  message?: string;
  /** Cover the full viewport with an overlay (e.g. auth/route loading) */
  fullscreen?: boolean;
  /** Drop the block's vertical padding, for spinners sitting inline in a layout that pads itself */
  compact?: boolean;
  /** Additional class name for the container */
  className?: string;
}

/**
 * Unified loading spinner on Ant `Spin`. Canonical loading primitive,
 * prefer this over per-view loading markup. Ant has three spinner sizes,
 * so the pixel `size` maps to the closest one.
 */
export function LoadingSpinner({ size = 40, message, fullscreen = false, compact = false, className }: LoadingSpinnerProps) {
  const spinSize = size >= 40 ? 'large' : size <= 20 ? 'small' : 'medium';
  const label = message ?? 'Loading';
  const classes = [
    fullscreen ? 'loading-spinner-fullscreen' : compact ? '' : 'loading-spinner-block',
    className,
  ].filter(Boolean).join(' ');
  return (
    <Flex vertical align="center" justify={fullscreen ? 'center' : undefined} gap="small" className={classes || undefined} role="status" aria-label={label}>
      <Spin size={spinSize} />
      {message && <Typography.Text type="secondary">{message}</Typography.Text>}
    </Flex>
  );
}

export default LoadingSpinner;
