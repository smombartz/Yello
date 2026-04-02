import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  ParsedContact,
  IncomingMatch,
  MatchResult,
  ImportDecision,
  ImportResult,
} from './icloudHooks';

// Re-export shared types for convenience
export type { ParsedContact, IncomingMatch, MatchResult, ImportDecision, ImportResult };

// --- Google-specific Types ---

export interface GoogleContactsStatus {
  hasContactsScope: boolean;
  needsReauth: boolean;
  reason?: string;
}

export interface GoogleContactsFetchResult {
  contacts: ParsedContact[];
  total: number;
  errors: Array<{ line: number; reason: string }>;
}

// --- Hooks ---

export function useGoogleContactsStatus() {
  return useQuery<GoogleContactsStatus>({
    queryKey: ['google-contacts', 'status'],
    queryFn: () => fetchApi<GoogleContactsStatus>('/api/auth/google/contacts-status'),
  });
}

export function useFetchGoogleContacts() {
  return useMutation<GoogleContactsFetchResult>({
    mutationFn: () =>
      fetchApi<GoogleContactsFetchResult>('/api/google-contacts/fetch', { method: 'POST' }),
  });
}

export function usePreviewGoogleContactsImport() {
  return useMutation<MatchResult, Error, { contacts: ParsedContact[] }>({
    mutationFn: (body) =>
      fetchApi<MatchResult>('/api/google-contacts/preview-import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useExecuteGoogleContactsImport() {
  const queryClient = useQueryClient();
  return useMutation<ImportResult, Error, ImportDecision>({
    mutationFn: (body) =>
      fetchApi<ImportResult>('/api/google-contacts/import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['google-contacts', 'status'] });
    },
  });
}
