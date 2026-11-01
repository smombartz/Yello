import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE, fetchApi } from './client';
import type { AdminUsersResponse } from './types';

export const adminKeys = {
  users: ['admin', 'users'] as const,
  datasets: ['admin', 'datasets'] as const,
};

export function useAdminUsers() {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: () => fetchApi<AdminUsersResponse>('/api/admin/users'),
    staleTime: 30 * 1000,
  });
}

/* --- Local data sets (backend/src/services/datasets.ts) --- */

export interface Dataset {
  name: string;
  kind: 'dev' | 'empty' | 'production-copy';
  createdAt: string | null;
  userCount: number;
  sizeBytes: number;
  active: boolean;
}

export interface DatasetsResponse {
  /** False on Railway: data sets only exist on a local server */
  enabled: boolean;
  active: string | null;
  datasets: Dataset[];
}

export function useDatasets() {
  return useQuery({
    queryKey: adminKeys.datasets,
    queryFn: () => fetchApi<DatasetsResponse>('/api/admin/datasets'),
  });
}

export function useCreateDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetchApi('/api/admin/datasets', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.datasets }),
  });
}

export function useDeleteDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetchApi(`/api/admin/datasets/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.datasets }),
  });
}

/** Switches the server's data set; the response signs the admin in to it. Reload afterwards. */
export function switchDataset(name: string): Promise<{ active: string }> {
  return fetchApi('/api/admin/datasets/switch', { method: 'POST', body: JSON.stringify({ name }) });
}

/** Creates data set `name` from a backup file (GET /api/admin/backup on Railway). */
export async function importDatasetFile(name: string, file: File): Promise<void> {
  const response = await fetch(`${API_BASE}/api/admin/datasets/import?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/gzip' },
    body: file,
  });
  if (!response.ok) {
    let message = `Import failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch { /* keep default */ }
    throw new Error(message);
  }
}

export const BACKUP_URL = `${API_BASE}/api/admin/backup`;
