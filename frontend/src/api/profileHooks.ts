import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type { UserProfile, UpdateUserProfileRequest } from './types';

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
