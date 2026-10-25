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
