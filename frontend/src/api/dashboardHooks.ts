import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './client';

interface OverviewStats {
  totalContacts: number;
  totalCountries: number;
  totalCities: number;
  contactsWithPhotos: number;
  contactsWithBirthdays: number;
}

interface UpcomingBirthday {
  id: number;
  displayName: string;
  birthday: string;
  daysUntil: number;
  photoHash: string | null;
}

interface RecentContact {
  id: number;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  photoHash: string | null;
}

interface GeographyStats {
  topCountries: Array<{ country: string; count: number }>;
  topCities: Array<{ city: string; country: string; count: number }>;
}

export interface DashboardStats {
  overview: OverviewStats;
  upcomingBirthdays: UpcomingBirthday[];
  recentlyAdded: RecentContact[];
  recentlyModified: RecentContact[];
  geography: GeographyStats;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => fetchApi<DashboardStats>('/api/stats/dashboard'),
    staleTime: 60000, // 1 minute cache
  });
}
