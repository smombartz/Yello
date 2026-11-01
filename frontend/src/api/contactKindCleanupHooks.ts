import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  ContactKind,
  ContactKindSummary,
  ContactKindSuggestionsResponse,
  SuggestedKind
} from './types';

// Cleanup: Company or Generic (backend/src/routes/contactKindCleanup.ts)

export function useContactKindSummary() {
  return useQuery({
    queryKey: ['contactKindCleanup', 'summary'],
    queryFn: () => fetchApi<ContactKindSummary>('/api/cleanup/contact-kind/summary'),
  });
}

export function useContactKindSuggestions(kind: SuggestedKind | null, page: number, pageSize: number) {
  const params = new URLSearchParams({
    limit: pageSize.toString(),
    offset: ((page - 1) * pageSize).toString(),
  });
  if (kind) params.set('kind', kind);

  return useQuery({
    queryKey: ['contactKindCleanup', 'suggestions', kind, page, pageSize],
    queryFn: () => fetchApi<ContactKindSuggestionsResponse>(`/api/cleanup/contact-kind/suggestions?${params}`),
    placeholderData: previous => previous,
  });
}

function useInvalidateAfterApply() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['contactKindCleanup'] });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    queryClient.invalidateQueries({ queryKey: ['contact'] });
  };
}

export function useApplyContactKind() {
  const invalidate = useInvalidateAfterApply();
  return useMutation({
    mutationFn: (items: { id: number; kind: ContactKind }[]) =>
      fetchApi<{ updated: number }>('/api/cleanup/contact-kind/apply', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),
    onSuccess: invalidate,
  });
}

/** Marks every current suggestion as suggested, except the skipped ones. */
export function useApplyAllContactKinds() {
  const invalidate = useInvalidateAfterApply();
  return useMutation({
    mutationFn: ({ kind, excludeIds }: { kind: SuggestedKind | null; excludeIds: number[] }) =>
      fetchApi<{ updated: number }>('/api/cleanup/contact-kind/apply-all', {
        method: 'POST',
        body: JSON.stringify({ ...(kind ? { kind } : {}), excludeIds }),
      }),
    onSuccess: invalidate,
  });
}
