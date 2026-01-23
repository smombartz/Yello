import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
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

export function useDuplicatesInfinite(mode: DeduplicationMode) {
  return useInfiniteQuery({
    queryKey: ['duplicates', 'infinite', mode],
    queryFn: ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        mode,
        limit: '50',
        offset: pageParam.toString(),
      });
      return fetchApi<DuplicateGroupsResponse>(`/api/duplicates?${params}`);
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce((sum, page) => sum + page.groups.length, 0);
      return totalLoaded < lastPage.totalGroups ? totalLoaded : undefined;
    },
    initialPageParam: 0,
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
