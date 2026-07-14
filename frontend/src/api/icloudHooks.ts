import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

// --- Types ---

export interface ICloudSettings {
  connected: boolean;
  email: string | null;
}

export interface ParsedEmail {
  email: string;
  type: string | null;
  isPrimary: boolean;
}

export interface ParsedPhone {
  phone: string;
  phoneDisplay: string | null;
  countryCode: string | null;
  type: string | null;
  isPrimary: boolean;
}

export interface ParsedAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  type: string | null;
}

export interface ParsedSocialProfile {
  platform: string;
  username: string | null;
  url: string | null;
}

export interface ParsedContact {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  emails: ParsedEmail[];
  phones: ParsedPhone[];
  addresses: ParsedAddress[];
  categories: string[];
  instantMessages: Array<{ service: string; handle: string; type: string | null }>;
  urls: Array<{ url: string; label: string | null; type: string | null }>;
  relatedPeople: Array<{ name: string; relationship: string | null }>;
  socialProfiles: ParsedSocialProfile[];
  photoBase64: string | null;
  rawVcard: string;
  /** vCard UID (iCloud); null for Google, which uses googleResourceName instead. */
  uid?: string | null;
  /** Google People API resourceName; absent for iCloud. */
  googleResourceName?: string | null;
}

export interface ICloudFetchResult {
  contacts: ParsedContact[];
  errors: Array<{ line: number; reason: string }>;
  total: number;
}

export interface IncomingMatch {
  incoming: ParsedContact;
  existingContactId: number;
  existingDisplayName: string;
  confidence: 'very_high' | 'high' | 'medium';
  matchReasons: string[];
  /** The matched contact is archived — merging would leave it archived, importing as new would resurrect it as a duplicate. */
  existingArchived?: boolean;
}

export interface MatchResult {
  newContacts: ParsedContact[];
  matches: IncomingMatch[];
  stats: { total: number; new: number; matched: number };
}

export interface ImportDecision {
  newContacts: ParsedContact[];
  merges: Array<{
    incomingContact: ParsedContact;
    existingContactId: number;
    conflictResolutions?: Record<string, 'incoming' | 'existing'>;
  }>;
  skipped: number;
}

export interface ImportResult {
  imported: number;
  merged: number;
  skipped: number;
  errors: Array<{ line: number; reason: string }>;
}

// --- Hooks ---

export function useICloudSettings() {
  return useQuery<ICloudSettings>({
    queryKey: ['icloud', 'settings'],
    queryFn: () => fetchApi<ICloudSettings>('/api/icloud/settings'),
  });
}

export function useSaveICloudSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; appPassword: string }) =>
      fetchApi<{ success: boolean; addressBookCount?: number }>('/api/icloud/settings', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['icloud', 'settings'] });
    },
  });
}

export function useDeleteICloudSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<{ success: boolean }>('/api/icloud/settings', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['icloud', 'settings'] });
    },
  });
}

export function useFetchICloudContacts() {
  return useMutation<ICloudFetchResult>({
    mutationFn: () =>
      fetchApi<ICloudFetchResult>('/api/icloud/fetch', { method: 'POST' }),
  });
}

export function usePreviewICloudImport() {
  return useMutation<MatchResult, Error, { contacts: ParsedContact[] }>({
    mutationFn: (body) =>
      fetchApi<MatchResult>('/api/icloud/preview-import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useExecuteICloudImport() {
  const queryClient = useQueryClient();
  return useMutation<ImportResult, Error, ImportDecision>({
    mutationFn: (body) =>
      fetchApi<ImportResult>('/api/icloud/import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
      queryClient.invalidateQueries({ queryKey: ['duplicates'] });
    },
  });
}
