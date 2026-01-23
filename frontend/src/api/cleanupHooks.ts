import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  CleanupMode,
  CleanupResponse,
  CleanupSummary,
  CleanupIdsResponse,
  DeleteContactsResponse,
  EmptyContactType,
  ProblematicContactType
} from './types';

export function useCleanupSummary(threshold: number = 3) {
  const params = new URLSearchParams({
    threshold: threshold.toString()
  });

  return useQuery({
    queryKey: ['cleanup', 'summary', threshold],
    queryFn: () => fetchApi<CleanupSummary>(`/api/cleanup/summary?${params}`),
  });
}

export function useCleanupContacts(
  mode: CleanupMode,
  page: number = 1,
  pageSize: number = 50,
  options?: {
    types?: EmptyContactType[] | ProblematicContactType[];
    threshold?: number;
  }
) {
  const offset = (page - 1) * pageSize;
  const { types, threshold = 3 } = options || {};

  // Convert types array to sorted string for stable query key
  const typesArray = types ? [...types].sort() : [];

  const params = new URLSearchParams({
    mode,
    limit: pageSize.toString(),
    offset: offset.toString(),
  });

  if (types && types.length > 0) {
    params.set('types', types.join(','));
  }

  if (mode === 'problematic') {
    params.set('threshold', threshold.toString());
  }

  return useQuery({
    queryKey: ['cleanup', 'contacts', mode, page, pageSize, typesArray, threshold],
    queryFn: () => fetchApi<CleanupResponse>(`/api/cleanup?${params}`),
  });
}

export function useDeleteContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactIds: number[]) =>
      fetchApi<DeleteContactsResponse>('/api/cleanup/delete', {
        method: 'DELETE',
        body: JSON.stringify({ contactIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleanup'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
    },
  });
}

// Fetch all contact IDs for the current query (for bulk "Select All" across pages)
export async function fetchAllCleanupContactIds(
  mode: CleanupMode,
  options?: {
    types?: EmptyContactType[] | ProblematicContactType[];
    threshold?: number;
  }
): Promise<number[]> {
  const { types, threshold = 3 } = options || {};

  const params = new URLSearchParams({ mode });

  if (types && types.length > 0) {
    params.set('types', types.join(','));
  }

  if (mode === 'problematic') {
    params.set('threshold', threshold.toString());
  }

  const response = await fetchApi<CleanupIdsResponse>(`/api/cleanup/ids?${params}`);
  return response.contactIds;
}
