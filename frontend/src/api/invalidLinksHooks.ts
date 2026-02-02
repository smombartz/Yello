import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  InvalidLinksSearchResponse,
  InvalidLinksRemoveResponse
} from './types';

export function useSearchInvalidLinks() {
  return useMutation({
    mutationFn: (patterns: string[]) =>
      fetchApi<InvalidLinksSearchResponse>('/api/cleanup/invalid-links/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patterns }),
      }),
  });
}

export function useRemoveInvalidLinks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patterns: string[]) =>
      fetchApi<InvalidLinksRemoveResponse>('/api/cleanup/invalid-links/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patterns }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['socialLinks'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
    },
  });
}
