import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  EmailHistoryResponse,
  EmailSyncResult,
  EmailRefreshAllResult,
} from './types';

/**
 * Fetch paginated email history for a contact.
 */
export function useContactEmailHistory(contactId: number | null, enabled: boolean = true) {
  return useInfiniteQuery({
    queryKey: ['emailHistory', contactId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '10' });
      if (pageParam) {
        params.set('cursor', pageParam);
      }
      return fetchApi<EmailHistoryResponse>(
        `/api/contacts/${contactId}/email-history?${params}`
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    enabled: enabled && contactId !== null,
  });
}

/**
 * Trigger a full email sync for a contact.
 */
export function useEmailSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: number) =>
      fetchApi<EmailSyncResult>(`/api/contacts/${contactId}/email-sync`, {
        method: 'POST',
      }),
    onSuccess: (_data, contactId) => {
      queryClient.invalidateQueries({ queryKey: ['emailHistory', contactId] });
    },
  });
}

/**
 * Trigger an incremental email refresh for a contact.
 */
export function useEmailRefresh() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: number) =>
      fetchApi<EmailSyncResult>(`/api/contacts/${contactId}/email-sync/refresh`, {
        method: 'POST',
      }),
    onSuccess: (_data, contactId) => {
      queryClient.invalidateQueries({ queryKey: ['emailHistory', contactId] });
    },
  });
}

/**
 * Trigger incremental refresh for all previously-synced contacts.
 */
export function useEmailRefreshAll() {
  return useMutation({
    mutationFn: () =>
      fetchApi<EmailRefreshAllResult>('/api/contacts/refresh-all', {
        method: 'POST',
      }),
  });
}
