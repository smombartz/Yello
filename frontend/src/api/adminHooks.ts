import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './client';
import type { AdminUsersResponse } from './types';

export const adminKeys = {
  users: ['admin', 'users'] as const,
};

export function useAdminUsers() {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: () => fetchApi<AdminUsersResponse>('/api/admin/users'),
    staleTime: 30 * 1000,
  });
}
