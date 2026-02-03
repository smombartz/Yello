import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  SocialLinksSummary,
  SocialLinksWithinContactResponse,
  SocialLinksFixAllResponse,
} from './types';

export function useSocialLinksSummary() {
  return useQuery({
    queryKey: ['socialLinks', 'summary'],
    queryFn: () => fetchApi<SocialLinksSummary>('/api/cleanup/social-links/summary'),
  });
}

export function useSocialLinksWithinContact(
  page: number = 1,
  pageSize: number = 50
) {
  const offset = (page - 1) * pageSize;

  const params = new URLSearchParams({
    limit: pageSize.toString(),
    offset: offset.toString(),
  });

  return useQuery({
    queryKey: ['socialLinks', 'withinContact', page, pageSize],
    queryFn: () => fetchApi<SocialLinksWithinContactResponse>(`/api/cleanup/social-links/within-contact?${params}`),
  });
}

export function useFixAllSocialLinks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<SocialLinksFixAllResponse>('/api/cleanup/social-links/within-contact/fix-all', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['socialLinks'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
    },
  });
}
