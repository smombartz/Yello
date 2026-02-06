import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type { UserProfile, UpdateUserProfileRequest, ContactSearchResult } from './types';

export function useUserProfile() {
  return useQuery({
    queryKey: ['userProfile'],
    queryFn: () => fetchApi<UserProfile>('/api/profile'),
  });
}

export function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserProfileRequest) =>
      fetchApi<UserProfile>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });
}

export function usePublicProfile(slug: string | null) {
  return useQuery({
    queryKey: ['publicProfile', slug],
    queryFn: () => fetchApi<UserProfile>(`/api/profile/public/${slug}`),
    enabled: !!slug,
  });
}

// Search contacts for linking
export function useSearchContactsForLinking(query: string) {
  return useQuery({
    queryKey: ['profileContactSearch', query],
    queryFn: () => fetchApi<ContactSearchResult[]>(`/api/profile/contacts/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 1,
    staleTime: 5000,
  });
}

// Link profile to a contact
export function useLinkProfileToContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (contactId: number) =>
      fetchApi<UserProfile>('/api/profile/link', {
        method: 'POST',
        body: JSON.stringify({ contactId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });
}

// Unlink profile from contact
export function useUnlinkProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<UserProfile>('/api/profile/unlink', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
  });
}

// Create a new contact and link it to profile
export function useCreateProfileContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (displayName: string) =>
      fetchApi<UserProfile>('/api/profile/create-contact', {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
