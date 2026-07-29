import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, uploadFile, uploadFileWithProgress } from './client';
import type {
  ContactListResponse,
  ContactDetail,
  ContactIdsResponse,
  VcfImportJob,
  StartImportResponse,
  ActiveImportJobResponse,
  GroupsResponse,
  UpdateContactRequest,
  CreateContactRequest,
  MergePreviewResponse,
  MergeRequest,
  MergeResponse,
  ContactSearchResult
} from './types';

export function useContacts(page: number = 1, limit: number = 50, search?: string, category?: string, sort?: string, filter?: string) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });
  if (search) {
    params.set('search', search);
  }
  if (category) {
    params.set('category', category);
  }
  if (sort && sort !== 'name-asc') {
    params.set('sort', sort);
  }
  if (filter) {
    params.set('filter', filter);
  }

  return useQuery({
    queryKey: ['contacts', { page, limit, search, category, sort, filter }],
    queryFn: () => fetchApi<ContactListResponse>(`/api/contacts?${params}`),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => fetchApi<GroupsResponse>('/api/contacts/groups'),
  });
}

// Typeahead search for linking related people. Optionally excludes a contact
// (the one being edited) so it can't be linked to itself.
export function useSearchContacts(query: string, excludeId?: number) {
  return useQuery({
    queryKey: ['contactSearch', query, excludeId],
    queryFn: () => {
      const params = new URLSearchParams({ q: query });
      if (excludeId != null) params.set('exclude', String(excludeId));
      return fetchApi<ContactSearchResult[]>(`/api/contacts/search?${params}`);
    },
    enabled: query.length >= 1,
    staleTime: 5000,
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

/** Survives a page reload so a running import can be picked back up. */
const IMPORT_JOB_STORAGE_KEY = 'yello.vcfImportJobId';

export function rememberImportJobId(jobId: string): void {
  try {
    localStorage.setItem(IMPORT_JOB_STORAGE_KEY, jobId);
  } catch { /* private mode — polling still works for this session */ }
}

export function readImportJobId(): string | null {
  try {
    return localStorage.getItem(IMPORT_JOB_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function forgetImportJobId(): void {
  try {
    localStorage.removeItem(IMPORT_JOB_STORAGE_KEY);
  } catch { /* nothing to clean up */ }
}

/**
 * Uploads a VCF and returns the background job that will process it. The
 * upload itself reports real byte progress; everything after that is polled
 * via useVcfImportJob.
 */
export function useStartVcfImport() {
  return useMutation({
    mutationFn: ({ file, onUploadProgress }: { file: File; onUploadProgress?: (percent: number) => void }) =>
      uploadFileWithProgress('/api/import', file, onUploadProgress ?? (() => {})) as Promise<StartImportResponse>,
    onSuccess: ({ jobId }) => rememberImportJobId(jobId),
  });
}

/**
 * Polls a running import. Stops as soon as the job reaches a terminal state,
 * then refreshes the contact list once.
 */
export function useVcfImportJob(jobId: string | null) {
  const queryClient = useQueryClient();
  const settledRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['vcfImportJob', jobId],
    queryFn: () => fetchApi<VcfImportJob>(`/api/import/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'running' ? 1500 : false;
    },
    staleTime: 0,
    // A stale id from localStorage should fail fast so the caller can drop it,
    // not retry and leave the import form stuck in a busy state.
    retry: false,
  });

  const job = query.data;

  useEffect(() => {
    if (!job || (job.status !== 'completed' && job.status !== 'failed')) return;
    // Guard against re-running on every poll-driven render.
    if (settledRef.current === job.id) return;
    settledRef.current = job.id;

    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    queryClient.invalidateQueries({ queryKey: ['contactCount'] });
    // The stored id deliberately outlives completion: the status indicator
    // shows terminal jobs until dismissed, so a result that landed while the
    // user was on another page (or before a reload) still gets seen.
    // ImportStatusProvider clears it via forgetImportJobId() on dismiss.
  }, [job, queryClient]);

  return query;
}

/**
 * Finds an import already in flight, so navigating away and back (or reloading)
 * reconnects to it instead of losing the progress display.
 */
export function useActiveVcfImportJob() {
  return useQuery({
    queryKey: ['vcfImportJob', 'active'],
    queryFn: () => fetchApi<ActiveImportJobResponse>('/api/import/jobs/active'),
    staleTime: 0,
  });
}

// Fetch all contact IDs for bulk "Select All" across pages
export async function fetchAllContactIds(search?: string): Promise<number[]> {
  const params = new URLSearchParams();

  if (search) {
    params.set('search', search);
  }

  const queryString = params.toString();
  const url = queryString ? `/api/contacts/ids?${queryString}` : '/api/contacts/ids';

  const response = await fetchApi<ContactIdsResponse>(url);
  return response.contactIds;
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateContactRequest }) =>
      fetchApi<ContactDetail>(`/api/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: (updatedContact) => {
      // Update the contact detail cache
      queryClient.setQueryData(['contact', updatedContact.id], updatedContact);
      // Invalidate contact list since display name or other visible fields may have changed
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateContactRequest) =>
      fetchApi<ContactDetail>('/api/contacts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (newContact) => {
      queryClient.setQueryData(['contact', newContact.id], newContact);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

// Merge preview - check for conflicts before merging
export function useMergePreview() {
  return useMutation({
    mutationFn: (contactIds: number[]) =>
      fetchApi<MergePreviewResponse>('/api/contacts/merge/preview', {
        method: 'POST',
        body: JSON.stringify({ contactIds }),
      }),
  });
}

// Merge contacts with optional conflict resolutions
export function useMergeSelectedContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MergeRequest) =>
      fetchApi<MergeResponse>('/api/contacts/merge', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useUploadProfileImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadFile('/api/profile-images/upload', file) as Promise<{ success: boolean; url: string; hash: string }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

// Set a contact photo as primary
export function useSetContactPhotoPrimary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contactId, photoId }: { contactId: number; photoId: number }) =>
      fetchApi<{ success: boolean }>(`/api/contacts/${contactId}/photos/${photoId}/primary`, {
        method: 'POST',
      }),
    onSuccess: (_data, variables) => {
      // Invalidate both the contact detail and contacts list to refresh the avatar
      queryClient.invalidateQueries({ queryKey: ['contact', variables.contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
