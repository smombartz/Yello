import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

export interface MapMarker {
  contactId: number;
  displayName: string;
  photoUrl: string | null;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  type: string | null;
}

export interface MapResponse {
  markers: MapMarker[];
  totalContacts: number;
  geocodedCount: number;
}

export interface MapStats {
  totalAddresses: number;
  geocodedAddresses: number;
  failedAddresses: number;
  pendingAddresses: number;
}

export interface GeocodeResult {
  processed: number;
  successful: number;
  failed: number;
  remaining: number;
}

export function useMapMarkers(search?: string, category?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category) params.set('category', category);

  const queryString = params.toString();
  const url = queryString ? `/api/map?${queryString}` : '/api/map';

  return useQuery({
    queryKey: ['map', { search, category }],
    queryFn: () => fetchApi<MapResponse>(url),
  });
}

export function useMapStats() {
  return useQuery({
    queryKey: ['mapStats'],
    queryFn: () => fetchApi<MapStats>('/api/map/stats'),
  });
}

export function useGeocode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (limit: number = 50) =>
      fetchApi<GeocodeResult>('/api/map/geocode', {
        method: 'POST',
        body: JSON.stringify({ limit }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['map'] });
      queryClient.invalidateQueries({ queryKey: ['mapStats'] });
    },
  });
}
