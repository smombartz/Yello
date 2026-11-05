import { Button, Card, Flex, Progress, Typography, theme } from 'antd';
import { Icon } from './Icon';
import { statusIcons } from '../theme/antIcons';

export type BackgroundJobStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Presentation-only shape for anything long-running that the user should be
 * able to walk away from. Currently only VCF import produces one; the other
 * long-running flows still stream over SSE and die on unmount, so they cannot
 * feed this until they move onto the job-table pattern.
 */
export interface BackgroundJobSummary {
  id: string;
  status: BackgroundJobStatus;
  /** Shown while the job runs, e.g. "Importing contacts". */
  label: string;
  /** Shown once the job succeeds, e.g. "Imported 8,900 contacts". */
  doneLabel: string;
  current: number;
  total: number;
  errorMessage?: string | null;
}

interface BackgroundJobPillProps {
  job: BackgroundJobSummary;
  onDismiss: () => void;
  /** Invoked when the pill body is activated — typically navigates to the job's page. */
  onOpen?: () => void;
}

/**
 * Persistent status pill for a job that outlives the page that started it.
 * Stays put until dismissed, including after the job finishes, so a result
 * that landed while the user was elsewhere is never silently lost.
 */
export function BackgroundJobPill({ job, onDismiss, onOpen }: BackgroundJobPillProps) {
  const { token } = theme.useToken();
  const isRunning = job.status === 'pending' || job.status === 'running';
  const percent = job.total > 0
    ? Math.min(100, Math.round((job.current / job.total) * 100))
    : 0;

  const title = job.status === 'completed'
    ? job.doneLabel
    : job.status === 'failed'
      ? (job.errorMessage || 'Import failed')
      : job.label;

  const iconColor = job.status === 'completed'
    ? token.colorSuccess
    : job.status === 'failed'
      ? token.colorError
      : token.colorPrimary;

  return (
    <div className="background-job-pill" role="status" aria-live="polite">
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Flex align="stretch">
          <Button
            type="text"
            block
            onClick={onOpen}
            disabled={!onOpen}
            style={{ flex: 1, minWidth: 0, height: 'auto', justifyContent: 'flex-start', padding: token.paddingSM }}
          >
            <Flex align="center" gap={token.marginSM} style={{ minWidth: 0 }}>
              <span style={{ color: iconColor, display: 'flex', fontSize: token.fontSizeLG }}>
                {isRunning && <Icon name="arrows-rotate" spin />}
                {job.status === 'completed' && statusIcons.success}
                {job.status === 'failed' && statusIcons.error}
              </span>
              <Flex vertical style={{ minWidth: 0, textAlign: 'left' }}>
                <Typography.Text strong ellipsis>{title}</Typography.Text>
                {isRunning && (
                  <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM, fontVariantNumeric: 'tabular-nums' }}>
                    {job.total > 0
                      ? `${job.current.toLocaleString()} of ${job.total.toLocaleString()}`
                      : 'Starting…'}
                  </Typography.Text>
                )}
              </Flex>
            </Flex>
          </Button>
          <Button
            type="text"
            onClick={onDismiss}
            aria-label="Dismiss"
            icon={<Icon name="xmark" />}
            style={{ height: 'auto' }}
          />
        </Flex>
        {isRunning && (
          <Progress percent={percent} size="small" showInfo={false} style={{ display: 'block', lineHeight: 0, margin: 0 }} />
        )}
      </Card>
    </div>
  );
}
