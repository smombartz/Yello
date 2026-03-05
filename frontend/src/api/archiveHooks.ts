import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  ArchivedListResponse,
  ArchivedCountResponse,
  ArchiveResponse,
  UnarchiveResponse,
  DeleteArchivedResponse
} from './types';

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:3456';

export function useArchivedContacts(page: number = 1, pageSize: number = 50) {
  const offset = (page - 1) * pageSize;

  const params = new URLSearchParams({
    limit: pageSize.toString(),
    offset: offset.toString()
  });

  return useQuery({
    queryKey: ['archive', 'list', page, pageSize],
    queryFn: () => fetchApi<ArchivedListResponse>(`/api/archive?${params}`)
  });
}

export function useArchivedCount() {
  return useQuery({
    queryKey: ['archive', 'count'],
    queryFn: () => fetchApi<ArchivedCountResponse>('/api/archive/count')
  });
}

export function useArchiveContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactIds: number[]) =>
      fetchApi<ArchiveResponse>('/api/archive', {
        method: 'POST',
        body: JSON.stringify({ contactIds })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive'] });
      queryClient.invalidateQueries({ queryKey: ['cleanup'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
    }
  });
}

export function useUnarchiveContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactIds: number[]) =>
      fetchApi<UnarchiveResponse>('/api/archive/unarchive', {
        method: 'POST',
        body: JSON.stringify({ contactIds })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive'] });
      queryClient.invalidateQueries({ queryKey: ['cleanup'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
    }
  });
}

export function useDeleteArchivedContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactIds: number[]) =>
      fetchApi<DeleteArchivedResponse>('/api/archive/delete', {
        method: 'DELETE',
        body: JSON.stringify({ contactIds })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive'] });
    }
  });
}

export function exportArchivedContacts() {
  const url = `${API_BASE}/api/archive/export`;

  // Trigger download by creating a temporary link
  const link = document.createElement('a');
  link.href = url;
  link.download = 'archived-contacts.vcf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
