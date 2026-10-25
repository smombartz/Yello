import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

// --- Types (mirror backend/src/services/sync/remoteBackupService.ts) ---

export type BackupProvider = 'icloud' | 'google';
export type BackupStatus = 'running' | 'verified' | 'unverified' | 'failed';

export interface BackupFile {
  name: string;
  bytes: number;
  sha256: string;
  description: string;
}

export interface BackupManifest {
  id: string;
  provider: BackupProvider;
  account: string | null;
  createdAt: string;
  finishedAt: string | null;
  status: BackupStatus;
  remoteCount: number;
  vcfCardCount: number;
  groupCount: number;
  photosIncluded: number;
  parseErrors: number;
  files: BackupFile[];
  error: string | null;
  confirmedAt: string | null;
}

export interface DeletionGate {
  allowed: boolean;
  reason: string | null;
  backup: BackupManifest | null;
}

export interface BackupsResponse {
  backups: BackupManifest[];
  gates: Record<BackupProvider, DeletionGate>;
}

const BACKUPS_KEY = ['sync', 'backups'] as const;

export function backupFileUrl(backupId: string, fileName: string): string {
  return `/api/sync/backups/${encodeURIComponent(backupId)}/files/${encodeURIComponent(fileName)}`;
}

// --- Hooks ---

export function useRemoteBackups() {
  return useQuery({
    queryKey: BACKUPS_KEY,
    queryFn: () => fetchApi<BackupsResponse>('/api/sync/backups'),
    // Poll while a backup runs; a Google backup with photos can take minutes.
    refetchInterval: query =>
      query.state.data?.backups.some(b => b.status === 'running') ? 2000 : false,
  });
}

export function useStartBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: BackupProvider) =>
      fetchApi<{ id: string }>('/api/sync/backups', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BACKUPS_KEY }),
  });
}

export function useConfirmBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (backupId: string) =>
      fetchApi<BackupManifest>(`/api/sync/backups/${encodeURIComponent(backupId)}/confirm`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BACKUPS_KEY }),
  });
}

// --- Cutover preview (mirror backend/src/services/sync/cutoverPlanner.ts) ---

export type CutoverItemKind =
  | 'link' | 'merged_duplicate' | 'update' | 'conflict' | 'possible_match'
  | 'import' | 'delete_remote' | 'restore_review' | 'create_remote' | 'group_card';

export interface ProviderPlanSummary {
  provider: BackupProvider;
  skipped: string | null;
  backupId: string | null;
  backupAt: string | null;
  remoteCards: number;
  groups: number;
  unreadable: Array<{ remoteId: string; error: string }>;
  matched: number;
  matchedByIdentifier: number;
  links: number;
  updates: { contacts: number; fields: number };
  conflicts: number;
  possibleMatches: number;
  imports: number;
  restoreReview: number;
  deletes: { mergedDuplicates: number; removedInCleanup: number; oldRemoteOnly: number; archivedInYello: number; total: number };
  creates: number;
  pushUpdates: number;
}

export interface CutoverSummary {
  windowDays: number;
  windowStart: string;
  generatedAt: string;
  yello: { active: number; archived: number; groupCards: number };
  providers: Record<BackupProvider, ProviderPlanSummary>;
}

export interface CutoverRecord {
  id: string;
  status: 'planning' | 'planned' | 'applying' | 'pushing' | 'done' | 'failed' | 'aborted';
  windowDays: number;
  summary: CutoverSummary | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CutoverItem {
  id: number;
  provider: BackupProvider | null;
  kind: CutoverItemKind;
  remoteId: string | null;
  contactId: number | null;
  displayName: string;
  field: string | null;
  yelloValue: unknown;
  remoteValue: unknown;
  yelloTs: string | null;
  remoteTs: string | null;
  reason: string | null;
  suggested: string | null;
  resolution: string | null;
}

const CUTOVER_KEY = ['sync', 'cutover', 'latest'] as const;

export function useLatestCutover() {
  return useQuery({
    queryKey: CUTOVER_KEY,
    queryFn: () => fetchApi<{ cutover: CutoverRecord | null }>('/api/sync/cutover/latest'),
    refetchInterval: query => (query.state.data?.cutover?.status === 'planning' ? 1500 : false),
  });
}

export function useStartCutoverPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (windowDays: number) =>
      fetchApi<{ id: string }>('/api/sync/cutover/plan', { method: 'POST', body: JSON.stringify({ windowDays }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CUTOVER_KEY }),
  });
}

export function useCutoverItems(
  cutoverId: string | undefined,
  filter: { kind: CutoverItemKind; provider?: BackupProvider },
  enabled: boolean
) {
  const params = new URLSearchParams({ kind: filter.kind, limit: '200' });
  if (filter.provider) params.set('provider', filter.provider);
  return useQuery({
    queryKey: ['sync', 'cutover', cutoverId, 'items', filter.kind, filter.provider ?? null],
    queryFn: () => fetchApi<{ items: CutoverItem[]; total: number }>(`/api/sync/cutover/${cutoverId}/items?${params}`),
    enabled: enabled && !!cutoverId,
  });
}
