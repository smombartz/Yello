import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, uploadFile } from './client';
import type {
  ContactListResponse,
  ContactDetail,
  ContactIdsResponse,
  ImportResult,
  GroupsResponse,
  UpdateContactRequest,
  CreateContactRequest,
  MergePreviewResponse,
  MergeRequest,
  MergeResponse
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
