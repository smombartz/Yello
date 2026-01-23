import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  ConfidenceLevel,
  DeduplicationMode,
  DuplicateGroupsResponse,
  DuplicateSummary,
  MergeRequest,
  MergeResponse
} from './types';

export function useDuplicateSummary() {
  return useQuery({
    queryKey: ['duplicates', 'summary'],
    queryFn: () => fetchApi<DuplicateSummary>('/api/duplicates/summary'),
  });
}

export function useDuplicates(mode: DeduplicationMode, limit: number = 50, offset: number = 0) {
  const params = new URLSearchParams({
    mode,
    limit: limit.toString(),
    offset: offset.toString(),
  });

  return useQuery({
    queryKey: ['duplicates', mode, { limit, offset }],
    queryFn: () => fetchApi<DuplicateGroupsResponse>(`/api/duplicates?${params}`),
  });
}

export function useDuplicatesInfinite(mode: DeduplicationMode, confidenceFilter?: Set<ConfidenceLevel>) {
  // Convert Set to sorted array for stable query key
  const confidenceLevels = confidenceFilter ? Array.from(confidenceFilter).sort() : [];

  return useInfiniteQuery({
    queryKey: ['duplicates', 'infinite', mode, confidenceLevels],
    queryFn: ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        mode,
        limit: '50',
        offset: pageParam.toString(),
      });

      // Add confidence filter for recommended mode
      if (mode === 'recommended' && confidenceFilter && confidenceFilter.size > 0) {
        params.set('confidence', Array.from(confidenceFilter).join(','));
      }

      return fetchApi<DuplicateGroupsResponse>(`/api/duplicates?${params}`);
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce((sum, page) => sum + page.groups.length, 0);
      return totalLoaded < lastPage.totalGroups ? totalLoaded : undefined;
    },
    initialPageParam: 0,
  });
}

export function useDuplicatesPaginated(
  mode: DeduplicationMode,
  page: number = 1,
  pageSize: number = 100,
  confidenceFilter?: Set<ConfidenceLevel>
) {
  const offset = (page - 1) * pageSize;
  // Convert Set to sorted array for stable query key
  const confidenceLevels = confidenceFilter ? Array.from(confidenceFilter).sort() : [];

  const params = new URLSearchParams({
    mode,
    limit: pageSize.toString(),
    offset: offset.toString(),
  });

  // Add confidence filter for recommended mode
  if (mode === 'recommended' && confidenceFilter && confidenceFilter.size > 0) {
    params.set('confidence', Array.from(confidenceFilter).join(','));
  }

  return useQuery({
    queryKey: ['duplicates', 'paginated', mode, page, pageSize, confidenceLevels],
    queryFn: () => fetchApi<DuplicateGroupsResponse>(`/api/duplicates?${params}`),
  });
}

export function useMergeContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MergeRequest) =>
      fetchApi<MergeResponse>('/api/duplicates/merge', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
    },
  });
}

// Lightweight group for bulk operations (no full contact details)
export interface DuplicateGroupLight {
  id: string;
  contactIds: number[];
  primaryContactId: number;
}

// Imperative fetch function (not a hook) for fetching all duplicate groups
export async function fetchAllDuplicateGroups(
  mode: DeduplicationMode,
  confidenceFilter?: Set<ConfidenceLevel>
): Promise<DuplicateGroupLight[]> {
  const params = new URLSearchParams({ mode });
  if (mode === 'recommended' && confidenceFilter?.size) {
    params.set('confidence', Array.from(confidenceFilter).join(','));
  }
  const response = await fetchApi<{ groups: DuplicateGroupLight[]; totalGroups: number }>(
    `/api/duplicates/all-groups?${params}`
  );
  return response.groups;
}
