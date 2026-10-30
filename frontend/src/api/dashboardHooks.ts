import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './client';
import { localToday } from '../utils/birthdays';

interface OverviewStats {
  totalContacts: number;
  totalCountries: number;
  totalCities: number;
  contactsWithPhotos: number;
  contactsWithBirthdays: number;
}

export interface UpcomingBirthday {
  id: number;
  displayName: string;
  birthday: string;
  daysUntil: number;
  photoHash: string | null;
}

/** added/imported/synced come from how the contact was created (`createdVia`). */
export type RecentKind = 'added' | 'imported' | 'synced' | 'updated' | 'archived';

export interface RecentChange {
  id: number;
  displayName: string;
  photoHash: string | null;
  kind: RecentKind;
  /** ISO UTC */
  at: string;
  /** manual, vcf_import, icloud_sync, ...; null for contacts created before it was recorded */
  createdVia: string | null;
}

export interface RecentChanges {
  days: number;
  counts: Record<RecentKind, number>;
  changes: RecentChange[];
}

interface GeographyStats {
  topCountries: Array<{ country: string; count: number }>;
  topCities: Array<{ city: string; country: string; count: number }>;
}

export interface DashboardStats {
  overview: OverviewStats;
  upcomingBirthdays: UpcomingBirthday[];
  /** Newest changes of the last 7 days, one per contact */
  recent: RecentChange[];
  /** Contacts changed in those 7 days, including those past the card's limit */
  recentTotal: number;
  geography: GeographyStats;
}

export function useDashboardStats() {
  const today = localToday();
  return useQuery({
    queryKey: ['dashboard-stats', today],
    queryFn: () => fetchApi<DashboardStats>(`/api/stats/dashboard?today=${today}`),
    staleTime: 60000, // 1 minute cache
  });
}

/** Every birthday in the address book, soonest first. */
export function useAllBirthdays() {
  const today = localToday();
  return useQuery({
    queryKey: ['all-birthdays', today],
    queryFn: () => fetchApi<{ birthdays: UpcomingBirthday[] }>(`/api/stats/birthdays?today=${today}`),
    staleTime: 60000,
  });
}

/** Contacts added, imported, synced, updated or archived in the last `days` days. */
export function useRecentChanges(days: number) {
  return useQuery({
    queryKey: ['recent-changes', days],
    queryFn: () => fetchApi<RecentChanges>(`/api/stats/recent?days=${days}`),
    staleTime: 60000,
  });
}
