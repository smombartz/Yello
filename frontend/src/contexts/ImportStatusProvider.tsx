import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  useVcfImportJob,
  useActiveVcfImportJob,
  readImportJobId,
  rememberImportJobId,
  forgetImportJobId
} from '../api/hooks';
import { ImportStatusContext } from './importStatusContextValue';
import type { BackgroundJobSummary } from '../components/BackgroundJobPill';

function buildDoneLabel(imported: number, skipped: number, failed: number): string {
  const parts = [`Imported ${imported.toLocaleString()} contact${imported === 1 ? '' : 's'}`];
  if (skipped > 0) parts.push(`${skipped.toLocaleString()} already present`);
  if (failed > 0) parts.push(`${failed.toLocaleString()} failed`);
  return parts.join(' · ');
}

/**
 * Owns VCF import tracking for the whole app.
 *
 * This used to live in SettingsView, which meant navigating away unmounted the
 * only thing watching the job — the import kept running with nothing to show
 * for it. Holding the job id here (and in localStorage) lets the indicator
 * survive navigation, a reload, and an import started in another tab.
 */
export function ImportStatusProvider({ children }: { children: ReactNode }) {
  const [trackedJobId, setTrackedJobId] = useState<string | null>(() => readImportJobId());
  const [dismissedJobId, setDismissedJobId] = useState<string | null>(null);

  const activeQuery = useActiveVcfImportJob();

  // Derived rather than synced via an effect: an explicitly tracked job wins,
  // otherwise adopt whatever the server reports as still running — which is how
  // an import started in another tab, or before a reload, gets picked up.
  const candidateId = trackedJobId ?? activeQuery.data?.job?.id ?? null;
  const activeJobId = candidateId && candidateId !== dismissedJobId ? candidateId : null;

  const { data: job, isError } = useVcfImportJob(activeJobId);

  // Drop a stored id that no longer resolves (wiped data, stale storage).
  // Touching localStorage is fine in an effect; deriving visibility from
  // `isError` below avoids a cascading setState.
  useEffect(() => {
    if (isError) forgetImportJobId();
  }, [isError]);

  const startTracking = useCallback((id: string) => {
    setTrackedJobId(id);
    setDismissedJobId(null);
    rememberImportJobId(id);
  }, []);

  // Terminal jobs are kept until explicitly dismissed, so a result that landed
  // while the user was on another page still gets seen.
  const dismiss = useCallback(() => {
    setDismissedJobId(activeJobId);
    setTrackedJobId(null);
    forgetImportJobId();
  }, [activeJobId]);

  const visibleJob = isError ? undefined : job;

  const summary = useMemo<BackgroundJobSummary | null>(() => {
    if (!visibleJob) return null;
    return {
      id: visibleJob.id,
      status: visibleJob.status,
      label: 'Importing contacts',
      doneLabel: buildDoneLabel(
        visibleJob.importedCount,
        visibleJob.skippedCount,
        visibleJob.failedCount
      ),
      current: visibleJob.cardsProcessed,
      total: visibleJob.totalCards,
      errorMessage: visibleJob.errorMessage
    };
  }, [visibleJob]);

  const value = useMemo(() => ({
    job: visibleJob,
    summary,
    isImporting: visibleJob?.status === 'pending' || visibleJob?.status === 'running',
    startTracking,
    dismiss
  }), [visibleJob, summary, startTracking, dismiss]);

  return (
    <ImportStatusContext.Provider value={value}>
      {children}
    </ImportStatusContext.Provider>
  );
}
