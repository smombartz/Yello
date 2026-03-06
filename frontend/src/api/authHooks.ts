import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

// Types
export interface ProfileImage {
  id: number;
  source: 'user_uploaded' | 'google' | 'google_contacts' | 'gravatar';
  url: string | null;
  isPrimary: boolean;
}

export interface User {
  id: number;
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isDemo?: boolean;
  hasOnboarded?: boolean;
  profileImages: ProfileImage[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthMeResponse {
  user: User | null;
  isAuthenticated: boolean;
}

// Query key
export const authKeys = {
  me: ['auth', 'me'] as const,
};

// Hooks

/**
 * Get the current authenticated user
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => fetchApi<AuthMeResponse>('/api/auth/me'),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    retry: false, // Don't retry on auth errors
  });
}

/**
 * Mark the current user as having completed onboarding
 */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => fetchApi<{ success: boolean }>('/api/auth/onboarded', { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

/**
 * Logout the current user
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<{ success: boolean }>('/api/auth/logout', {
        method: 'POST',
      }),
    onSuccess: () => {
      // Clear auth state
      queryClient.setQueryData(authKeys.me, {
        user: null,
        isAuthenticated: false,
      });
      // Invalidate all queries since user context has changed
      queryClient.invalidateQueries();
    },
  });
}
