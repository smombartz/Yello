import { Icon } from './Icon';
import type { VcfImportJob } from '../api/types';

interface LastImportSummaryProps {
  job: VcfImportJob;
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'unknown time';
  // SQLite datetime('now') is UTC without a zone marker; without the Z the
  // browser would read it as local time and show the wrong offset.
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'unknown time';

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function formatSize(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Persistent record of the most recent finished import. Sourced from
 * `/api/import/jobs/latest` rather than the tracked job, so it survives
 * dismissing the status indicator, navigation, and new sessions.
 */
export function LastImportSummary({ job }: LastImportSummaryProps) {
  const result = job.result;
  const failed = result?.failed ?? job.failedCount;
  const errors = result?.errors ?? [];

  // addressesGeotagged is optional on results written before GEO import existed.
  const geotagged = result?.addressesGeotagged ?? job.addressesGeotagged;

  const stats = [
    { key: 'imported', label: 'Imported', value: result?.imported ?? job.importedCount, tone: 'primary' as const },
    { key: 'skipped', label: 'Already present', value: result?.skipped ?? job.skippedCount, tone: 'muted' as const },
    { key: 'photos', label: 'Photos', value: result?.photosProcessed ?? job.photosProcessed, tone: 'muted' as const },
    { key: 'geotagged', label: 'Geotagged', value: geotagged, tone: 'muted' as const },
    { key: 'failed', label: 'Failed', value: failed, tone: 'error' as const }
  ];

  const size = formatSize(job.fileSize);

  return (
    <section className="last-import">
      <header className="last-import__header">
        <h3 className="last-import__title">
          <Icon name={job.status === 'failed' ? 'circle-exclamation' : 'clock-rotate-left'} />
          Last import
        </h3>
        <span className="last-import__meta">
          {job.filename ? `${job.filename} · ` : ''}
          {formatWhen(job.completedAt ?? job.createdAt)}
          {size ? ` · ${size}` : ''}
        </span>
      </header>

      {job.status === 'failed' ? (
        <p className="last-import__error">
          {job.errorMessage || 'The import failed.'}
        </p>
      ) : (
        <>
          <dl className="last-import__stats">
            {stats.map(stat => (
              <div
                key={stat.key}
                className={`last-import__stat last-import__stat--${stat.tone}${stat.value === 0 ? ' is-zero' : ''}`}
              >
                <dt className="last-import__stat-label">{stat.label}</dt>
                <dd className="last-import__stat-value">{stat.value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>

          {failed > 0 && errors.length > 0 && (
            <details className="last-import__errors">
              <summary>{failed.toLocaleString()} failed to import</summary>
              <ul>
                {errors.map((err, i) => (
                  <li key={i}>Card {err.line}: {err.reason}</li>
                ))}
              </ul>
              {failed > errors.length && (
                <p className="settings-description">
                  Showing the first {errors.length.toLocaleString()} of {failed.toLocaleString()} errors.
                </p>
              )}
            </details>
          )}
        </>
      )}
    </section>
  );
}
