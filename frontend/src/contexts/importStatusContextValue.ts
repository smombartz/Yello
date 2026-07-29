import { createContext } from 'react';
import type { VcfImportJob } from '../api/types';
import type { BackgroundJobSummary } from '../components/BackgroundJobPill';

export interface ImportStatusContextType {
  /** The tracked job's full row, for pages that render their own detail view. */
  job: VcfImportJob | undefined;
  /** The same job reduced to what the global indicator needs, or null. */
  summary: BackgroundJobSummary | null;
  /** True while an import is queued or running. */
  isImporting: boolean;
  /** Begin tracking a freshly started import. */
  startTracking: (jobId: string) => void;
  /** Stop showing the job. Terminal jobs persist until this is called. */
  dismiss: () => void;
}

export const ImportStatusContext = createContext<ImportStatusContextType | undefined>(undefined);
