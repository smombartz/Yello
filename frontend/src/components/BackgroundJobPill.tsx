import { Icon } from './Icon';

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
  const isRunning = job.status === 'pending' || job.status === 'running';
  const percent = job.total > 0
    ? Math.min(100, Math.round((job.current / job.total) * 100))
    : 0;

  const title = job.status === 'completed'
    ? job.doneLabel
    : job.status === 'failed'
      ? (job.errorMessage || 'Import failed')
      : job.label;

  return (
    <div
      className={`background-job-pill background-job-pill--${job.status}`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="background-job-pill__body"
        onClick={onOpen}
        disabled={!onOpen}
      >
        <span className="background-job-pill__icon">
          {isRunning && <Icon name="arrows-rotate" className="spinning" />}
          {job.status === 'completed' && <Icon name="circle-check" />}
          {job.status === 'failed' && <Icon name="circle-exclamation" />}
        </span>

        <span className="background-job-pill__text">
          <span className="background-job-pill__title">{title}</span>
          {isRunning && (
            <span className="background-job-pill__count">
              {job.total > 0
                ? `${job.current.toLocaleString()} of ${job.total.toLocaleString()}`
                : 'Starting…'}
            </span>
          )}
        </span>
      </button>

      <button
        type="button"
        className="background-job-pill__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <Icon name="xmark" />
      </button>

      {isRunning && (
        <div className="background-job-pill__progress">
          <div
            className="background-job-pill__progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
