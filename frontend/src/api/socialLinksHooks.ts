import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  SocialLinksSummary,
  SocialLinksCrossContactResponse,
  SocialLinksWithinContactResponse,
  SocialLinksFixAllResponse,
  SocialLinksCrossContactGroupLight,
  SocialLinksCrossContactAllGroupsResponse
} from './types';

export function useSocialLinksSummary() {
  return useQuery({
    queryKey: ['socialLinks', 'summary'],
    queryFn: () => fetchApi<SocialLinksSummary>('/api/cleanup/social-links/summary'),
  });
}

export function useSocialLinksCrossContact(
  page: number = 1,
  pageSize: number = 50,
  platform?: string
) {
  const offset = (page - 1) * pageSize;

  const params = new URLSearchParams({
    limit: pageSize.toString(),
    offset: offset.toString(),
  });

  if (platform) {
    params.set('platform', platform);
  }

  return useQuery({
    queryKey: ['socialLinks', 'crossContact', page, pageSize, platform],
    queryFn: () => fetchApi<SocialLinksCrossContactResponse>(`/api/cleanup/social-links/cross-contact?${params}`),
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

// Imperative fetch function (not a hook) for fetching all cross-contact duplicate groups
export async function fetchAllSocialLinksCrossContactGroups(
  platform?: string
): Promise<SocialLinksCrossContactGroupLight[]> {
  const params = new URLSearchParams();
  if (platform) {
    params.set('platform', platform);
  }
  const url = params.toString()
    ? `/api/cleanup/social-links/cross-contact/all-groups?${params}`
    : '/api/cleanup/social-links/cross-contact/all-groups';
  const response = await fetchApi<SocialLinksCrossContactAllGroupsResponse>(url);
  return response.groups;
}
