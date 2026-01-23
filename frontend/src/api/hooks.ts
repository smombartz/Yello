import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, uploadFile } from './client';
import type { ContactListResponse, ContactDetail, ImportResult } from './types';

export function useContacts(page: number = 1, limit: number = 50, search?: string) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (search) {
    params.set('search', search);
  }

  return useQuery({
    queryKey: ['contacts', { page, limit, search }],
    queryFn: () => fetchApi<ContactListResponse>(`/api/contacts?${params}`),
  });
}

export function useContactDetail(id: number | null) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => fetchApi<ContactDetail>(`/api/contacts/${id}`),
    enabled: id !== null,
  });
}

export function useContactCount() {
  return useQuery({
    queryKey: ['contactCount'],
    queryFn: () => fetchApi<{ total: number }>('/api/contacts/count'),
  });
}

export function useImportVcf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadFile('/api/import', file) as Promise<ImportResult>,
    onSuccess: () => {
      // Invalidate all contact queries after import
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
    },
  });
}
