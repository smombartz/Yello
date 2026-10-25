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
  restores?: RestoreRecord[];
}

export interface RestoreRecord {
  mode: 'missing' | 'all';
  startedAt: string;
  finishedAt: string;
  recreated: number;
  reverted: number;
  unchanged: number;
  failed: number;
  errors: string[];
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

/** `poll` keeps refreshing (e.g. while a restore runs, which the list does not show as running). */
export function useRemoteBackups(poll = false) {
  return useQuery({
    queryKey: BACKUPS_KEY,
    queryFn: () => fetchApi<BackupsResponse>('/api/sync/backups'),
    // Poll while a backup runs; a Google backup with photos can take minutes.
    refetchInterval: query =>
      poll || query.state.data?.backups.some(b => b.status === 'running') ? 2000 : false,
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

export interface SyncCounters {
  pulledCreated: number;
  pulledUpdated: number;
  pulledArchived: number;
  pushedCreated: number;
  pushedUpdated: number;
  pushedDeleted: number;
  conflicts: number;
}

export interface CutoverApplyRecord {
  appliedAt: string | null;
  finishedAt: string | null;
  results: Partial<Record<BackupProvider, { runId: number | null; status: string; reason: string | null; counters: SyncCounters }>>;
}

export interface CutoverSummary {
  windowDays: number;
  windowStart: string;
  generatedAt: string;
  yello: { active: number; archived: number; groupCards: number };
  providers: Record<BackupProvider, ProviderPlanSummary>;
  apply?: CutoverApplyRecord;
  carriedChoices?: { carried: number; previous: number };
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
  /** What the reviewer can choose for this item (empty: nothing to decide). */
  choices: string[];
  /** The resolution that applies: the reviewer's, else the default. */
  effective: string | null;
}

const CUTOVER_KEY = ['sync', 'cutover', 'latest'] as const;

export function useLatestCutover() {
  return useQuery({
    queryKey: CUTOVER_KEY,
    queryFn: () => fetchApi<{ cutover: CutoverRecord | null; applying: boolean; choices: Partial<Record<CutoverItemKind, string[]>> }>('/api/sync/cutover/latest'),
    refetchInterval: query => {
      const data = query.state.data;
      if (data?.cutover?.status === 'planning') return 1500;
      return data?.applying || data?.cutover?.status === 'applying' ? 3000 : false;
    },
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

export function useResolveCutoverItems(cutoverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: Array<{ id: number; resolution: string | null }>) =>
      fetchApi<{ changed: number }>(`/api/sync/cutover/${cutoverId}/resolve`, { method: 'POST', body: JSON.stringify({ items }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync', 'cutover', cutoverId] }),
  });
}

export function useResolveAllCutoverItems(cutoverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind?: CutoverItemKind; provider?: BackupProvider; resolution: string | null }) =>
      fetchApi<{ changed: number }>(`/api/sync/cutover/${cutoverId}/resolve-all`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync', 'cutover', cutoverId] }),
  });
}

export function useApplyCutover(cutoverId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchApi<{ started: boolean }>(`/api/sync/cutover/${cutoverId}/apply`, { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CUTOVER_KEY }),
  });
}

export interface SyncProviderState {
  provider: BackupProvider;
  enabled: boolean;
  paused: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  cutoverCompletedAt: string | null;
}

const STATUS_KEY = ['sync', 'status'] as const;

export function useSyncStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => fetchApi<{
      engineEnabled: boolean;
      intervalMinutes: number;
      running: BackupProvider[];
      providers: SyncProviderState[];
    }>('/api/sync/status'),
    // Poll while a sync runs, otherwise now and then (scheduled runs happen in the background).
    refetchInterval: query => (query.state.data?.running.length ? 3000 : 60000),
  });
}

export interface SyncRun {
  id: number;
  provider: BackupProvider;
  trigger: 'cutover' | 'scheduled' | 'manual' | 'local_edit';
  status: 'running' | 'completed' | 'failed' | 'paused';
  started_at: string;
  finished_at: string | null;
  pulled_created: number;
  pulled_updated: number;
  pulled_archived: number;
  pushed_created: number;
  pushed_updated: number;
  pushed_deleted: number;
  conflicts: number;
  errors: Array<{ contactId: number | null; remoteId: string | null; message: string }>;
}

export function useSyncRuns(enabled: boolean) {
  return useQuery({
    queryKey: ['sync', 'runs'] as const,
    queryFn: () => fetchApi<{ runs: SyncRun[] }>('/api/sync/runs?limit=15'),
    enabled,
  });
}

export interface SyncRunResult {
  runId: number | null;
  status: 'completed' | 'failed' | 'paused' | 'skipped';
  reason: string | null;
  counters: SyncCounters;
}

/** Sync one provider, or every one ('all'), now. */
export function useRunSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, confirmLargeChanges }: { provider: BackupProvider | 'all'; confirmLargeChanges?: boolean }) =>
      provider === 'all'
        ? fetchApi<Partial<Record<BackupProvider, SyncRunResult>>>('/api/sync/run-all', { method: 'POST', body: JSON.stringify({ confirmLargeChanges }) })
        : fetchApi<SyncRunResult>('/api/sync/run', { method: 'POST', body: JSON.stringify({ provider, confirmLargeChanges }) })
          .then(result => ({ [provider]: result }) as Partial<Record<BackupProvider, SyncRunResult>>),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sync'] });
      // Pulled edits change contacts too.
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function usePauseSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, pause }: { provider: BackupProvider; pause: boolean }) =>
      fetchApi<{ providers: SyncProviderState[] }>(`/api/sync/${pause ? 'pause' : 'resume'}`, { method: 'POST', body: JSON.stringify({ provider }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
  });
}

export interface RemoteVersion {
  id: number;
  provider: BackupProvider;
  reason: 'conflict_yello_won' | 'remote_delete' | 'pre_update' | 'cutover_conflict' | 'cutover_delete';
  createdAt: string;
  restoredAt: string | null;
  restorable: boolean;
  preview: { displayName: string; lines: string[] } | null;
}

export function useRemoteVersions(contactId: number | null) {
  return useQuery({
    queryKey: ['sync', 'remote-versions', contactId] as const,
    queryFn: () => fetchApi<{ versions: RemoteVersion[] }>(`/api/sync/remote-versions?contactId=${contactId}`),
    enabled: contactId !== null,
  });
}

export function useRestoreRemoteVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: number) =>
      fetchApi<{ contactId: number }>(`/api/sync/remote-versions/${versionId}/restore`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync', 'remote-versions'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact'] });
    },
  });
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ backupId, mode }: { backupId: string; mode: 'missing' | 'all' }) =>
      fetchApi<{ started: boolean }>(`/api/sync/backups/${encodeURIComponent(backupId)}/restore`, {
        method: 'POST', body: JSON.stringify({ mode }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BACKUPS_KEY }),
  });
}

export interface TallyRow {
  unchanged: number;
  updated: number;
  new: number;
  /** Removed from the address book; for Yello: archived. */
  deleted: number;
}

export interface CutoverTally {
  cutoverId: string;
  yello: TallyRow;
  providers: Partial<Record<BackupProvider, TallyRow>>;
}

/** Recounted after every change of a choice (resolving invalidates the cutover's queries). */
export function useCutoverTally(cutoverId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['sync', 'cutover', cutoverId, 'tally'] as const,
    queryFn: () => fetchApi<CutoverTally>(`/api/sync/cutover/${cutoverId}/tally`),
    enabled: enabled && !!cutoverId,
    placeholderData: previous => previous,
  });
}

export interface CutoverSection {
  kind: CutoverItemKind;
  provider: BackupProvider | null;
  total: number;
  /** How many items take each choice. */
  choices: Record<string, number>;
  /** How many still follow the suggestion. */
  suggested: number;
}

export function useCutoverSections(cutoverId: string | undefined) {
  return useQuery({
    queryKey: ['sync', 'cutover', cutoverId, 'sections'] as const,
    queryFn: () => fetchApi<{ sections: CutoverSection[] }>(`/api/sync/cutover/${cutoverId}/sections`),
    enabled: !!cutoverId,
    placeholderData: previous => previous,
  });
}
