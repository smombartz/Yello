import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type { UserSettings, UpdateUserSettingsRequest } from './types';

export function useUserSettings() {
  return useQuery({
    queryKey: ['userSettings'],
    queryFn: () => fetchApi<UserSettings>('/api/settings'),
  });
}

export function useUpdateUserSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserSettingsRequest) =>
      fetchApi<UserSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSettings'] });
    },
  });
}

export function exportAllContacts(): void {
  window.open('/api/contacts/export/vcf', '_blank');
}
