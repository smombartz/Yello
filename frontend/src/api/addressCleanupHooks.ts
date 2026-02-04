import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type {
  AddressCleanupSummary,
  AddressCleanupResponse,
  AddressFixResponse,
  AddressCleanupBulkResponse,
  AddressFix,
  NormalizeSummary,
  NormalizeResponse,
  NormalizeFixResponse,
  NormalizeAllIdsResponse,
  DuplicatesSummary,
  DuplicatesResponse,
  GeocodingSummary,
  GeocodingResponse,
  GeocodingFilter,
  GeocodingBatchResult,
  GeocodingUpdateResponse
} from './types';

// ============================================================
// Legacy hooks (combined view) - kept for backward compatibility
// ============================================================

export function useAddressCleanupSummary() {
  return useQuery({
    queryKey: ['addressCleanup', 'summary'],
    queryFn: () => fetchApi<AddressCleanupSummary>('/api/cleanup/addresses/summary'),
  });
}

export function useAddressCleanupContacts(
  page: number = 1,
  pageSize: number = 50
) {
  const offset = (page - 1) * pageSize;

  const params = new URLSearchParams({
    limit: pageSize.toString(),
    offset: offset.toString(),
  });

  return useQuery({
    queryKey: ['addressCleanup', 'contacts', page, pageSize],
    queryFn: () => fetchApi<AddressCleanupResponse>(`/api/cleanup/addresses?${params}`),
  });
}

export function useAddressCleanupBulk() {
  return useQuery({
    queryKey: ['addressCleanup', 'bulk'],
    queryFn: () => fetchApi<AddressCleanupBulkResponse>('/api/cleanup/addresses/all'),
    enabled: false, // Only fetch when explicitly requested
  });
}

export function useFixAddresses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fixes: AddressFix[]) =>
      fetchApi<AddressFixResponse>('/api/cleanup/addresses/fix', {
        method: 'POST',
        body: JSON.stringify({ fixes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addressCleanup'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export async function fetchAllAddressIssueContacts(): Promise<AddressCleanupBulkResponse['contacts']> {
  const response = await fetchApi<AddressCleanupBulkResponse>('/api/cleanup/addresses/all');
  return response.contacts;
}

// ============================================================
// Normalize hooks (junk address removal)
// ============================================================

export function useNormalizeSummary() {
  return useQuery({
    queryKey: ['addressCleanup', 'normalize', 'summary'],
    queryFn: () => fetchApi<NormalizeSummary>('/api/cleanup/addresses/normalize/summary'),
  });
}

export function useNormalizeContacts(
  page: number = 1,
  pageSize: number = 50
) {
  const offset = (page - 1) * pageSize;

  const params = new URLSearchParams({
    limit: pageSize.toString(),
    offset: offset.toString(),
  });

  return useQuery({
    queryKey: ['addressCleanup', 'normalize', 'contacts', page, pageSize],
    queryFn: () => fetchApi<NormalizeResponse>(`/api/cleanup/addresses/normalize?${params}`),
  });
}

export function useRemoveJunkAddresses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (addressIds: number[]) =>
      fetchApi<NormalizeFixResponse>('/api/cleanup/addresses/normalize/fix', {
        method: 'POST',
        body: JSON.stringify({ addressIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addressCleanup'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export async function fetchAllJunkAddressIds(): Promise<number[]> {
  const response = await fetchApi<NormalizeAllIdsResponse>('/api/cleanup/addresses/normalize/all');
  return response.addressIds;
}

// ============================================================
// Duplicates hooks (within-contact duplicate merging)
// ============================================================

export function useDuplicatesSummary() {
  return useQuery({
    queryKey: ['addressCleanup', 'duplicates', 'summary'],
    queryFn: () => fetchApi<DuplicatesSummary>('/api/cleanup/addresses/duplicates/summary'),
  });
}

export function useDuplicatesContacts(
  page: number = 1,
  pageSize: number = 50
) {
  const offset = (page - 1) * pageSize;

  const params = new URLSearchParams({
    limit: pageSize.toString(),
    offset: offset.toString(),
  });

  return useQuery({
    queryKey: ['addressCleanup', 'duplicates', 'contacts', page, pageSize],
    queryFn: () => fetchApi<DuplicatesResponse>(`/api/cleanup/addresses/duplicates?${params}`),
  });
}

export function useFixDuplicateAddresses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fixes: AddressFix[]) =>
      fetchApi<AddressFixResponse>('/api/cleanup/addresses/duplicates/fix', {
        method: 'POST',
        body: JSON.stringify({ fixes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addressCleanup'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export async function fetchAllDuplicateContacts(): Promise<AddressCleanupBulkResponse['contacts']> {
  const response = await fetchApi<AddressCleanupBulkResponse>('/api/cleanup/addresses/duplicates/all');
  return response.contacts;
}

// ============================================================
// Geocoding hooks
// ============================================================

export function useGeocodingSummary() {
  return useQuery({
    queryKey: ['addressCleanup', 'geocoding', 'summary'],
    queryFn: () => fetchApi<GeocodingSummary>('/api/cleanup/addresses/geocoding/summary'),
  });
}

export function useGeocodingContacts(
  filter: GeocodingFilter = 'all',
  page: number = 1,
  pageSize: number = 50
) {
  const offset = (page - 1) * pageSize;

  const params = new URLSearchParams({
    filter,
    limit: pageSize.toString(),
    offset: offset.toString(),
  });

  return useQuery({
    queryKey: ['addressCleanup', 'geocoding', 'contacts', filter, page, pageSize],
    queryFn: () => fetchApi<GeocodingResponse>(`/api/cleanup/addresses/geocoding?${params}`),
  });
}

export function useRetryGeocoding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (addressIds: number[]) =>
      fetchApi<GeocodingBatchResult>('/api/cleanup/addresses/geocoding/retry', {
        method: 'POST',
        body: JSON.stringify({ addressIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addressCleanup', 'geocoding'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useBatchGeocode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (limit: number = 50) =>
      fetchApi<GeocodingBatchResult>('/api/cleanup/addresses/geocoding/batch', {
        method: 'POST',
        body: JSON.stringify({ limit }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addressCleanup', 'geocoding'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateAndGeocode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      addressId: number;
      street?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
    }) =>
      fetchApi<GeocodingUpdateResponse>('/api/cleanup/addresses/geocoding/update', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addressCleanup', 'geocoding'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
