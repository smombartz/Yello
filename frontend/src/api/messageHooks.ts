import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import { localToday } from '../utils/birthdays';

/** Top contacts: message activity per person (backend routes/messages.ts). */

export const MESSAGE_CHANNELS = ['gmail', 'imessage', 'whatsapp', 'instagram', 'linkedin'] as const;
export type MessageChannel = typeof MESSAGE_CHANNELS[number];

export const CHANNEL_LABELS: Record<MessageChannel, string> = {
  gmail: 'Gmail',
  imessage: 'iMessage',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

/** Font Awesome icon and style for each channel */
export const CHANNEL_ICONS: Record<MessageChannel, { name: string; style?: 'brands' }> = {
  gmail: { name: 'envelope' },
  imessage: { name: 'comment' },
  whatsapp: { name: 'whatsapp', style: 'brands' },
  instagram: { name: 'instagram', style: 'brands' },
  linkedin: { name: 'linkedin', style: 'brands' },
};

export interface MessageSource {
  channel: MessageChannel;
  status: 'idle' | 'running' | 'failed';
  coveredFrom: string | null;
  coveredThrough: string | null;
  lastImportedAt: string | null;
  progressDone: number | null;
  progressTotal: number | null;
  error: string | null;
  handles: number;
  matchedHandles: number;
  messages: number;
}

export interface ChannelCounts {
  sent: number;
  received: number;
  group: number;
}

export interface TopContact {
  contactId: number;
  displayName: string;
  photoUrl: string | null;
  photoHash: string | null;
  score: number;
  total: number;
  sent: number;
  received: number;
  group: number;
  lastDay: string;
  channels: Partial<Record<MessageChannel, ChannelCounts>>;
  months: number[];
}

export type RankMode = 'score' | 'count';
export type RankWindow = '30' | '90' | '365' | 'all';

export interface HandleItem {
  channel: MessageChannel;
  handle: string;
  label: string;
  kind: 'phone' | 'email' | 'username' | 'url' | 'opaque';
  displayName: string | null;
  sent: number;
  received: number;
  group: number;
  lastDay: string | null;
  matchSource: string | null;
  contact: { id: number; displayName: string; photoUrl: string | null } | null;
  suggestion: { id: number; displayName: string; photoUrl: string | null } | null;
}

export type HandleStatus = 'unmatched' | 'matched' | 'ignored';

export interface ContactMessageStats {
  total: number;
  last30Days: number;
  lastDay: string | null;
  channels: Array<ChannelCounts & { channel: MessageChannel; lastDay: string; handles: string[] }>;
}

export interface ActivityUpload {
  channel: MessageChannel;
  from: string;
  to: string;
  handles: Array<{ handle: string; kind?: HandleItem['kind']; displayName?: string | null }>;
  activity: Array<{ handle: string; day: string; sent?: number; received?: number; group?: number }>;
  final?: boolean;
}

type HandleRef = { channel: MessageChannel; handle: string };

const KEYS = {
  sources: ['message-sources'] as const,
  top: ['message-top'] as const,
  handles: ['message-handles'] as const,
  contact: ['message-contact'] as const,
};

export function useMessageSources() {
  return useQuery({
    queryKey: KEYS.sources,
    queryFn: () => fetchApi<{ sources: MessageSource[] }>('/api/messages/sources'),
    // Progress while a Gmail scan runs; every screen showing sources polls, so keep it slow
    refetchInterval: (query) => query.state.data?.sources.some(s => s.status === 'running') ? 5000 : false,
  });
}

export function useTopContacts(mode: RankMode, window: RankWindow, channel: MessageChannel | null, limit = 100) {
  const today = localToday();
  return useQuery({
    queryKey: [...KEYS.top, mode, window, channel, limit, today],
    queryFn: () => {
      const params = new URLSearchParams({ mode, window, limit: String(limit), today });
      if (channel) params.set('channel', channel);
      return fetchApi<{ contacts: TopContact[]; total: number }>(`/api/messages/top?${params}`);
    },
  });
}

/** messages: busiest first; suggestions: people with a name match first */
export type HandleSort = 'messages' | 'suggestions';

export function useMessageHandles(
  status: HandleStatus, channel: MessageChannel | null, limit = 50, offset = 0, sort: HandleSort = 'messages',
) {
  return useQuery({
    queryKey: [...KEYS.handles, status, channel, limit, offset, sort],
    queryFn: () => {
      const params = new URLSearchParams({ status, limit: String(limit), offset: String(offset), sort });
      if (channel) params.set('channel', channel);
      // suggestions: how many in the whole list have a name match, not just this page
      return fetchApi<{ handles: HandleItem[]; total: number; suggestions: number }>(`/api/messages/handles?${params}`);
    },
  });
}

export function useContactMessageStats(contactId: number | null) {
  return useQuery({
    queryKey: [...KEYS.contact, contactId],
    queryFn: () => fetchApi<ContactMessageStats>(`/api/messages/contacts/${contactId}`),
    enabled: contactId != null,
  });
}

/** Everything that can change after an upload or a match */
function useInvalidateMessages() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of Object.values(KEYS)) void queryClient.invalidateQueries({ queryKey: key });
  };
}

export function postActivity(batch: ActivityUpload) {
  return fetchApi<{ handles: number; days: number; matched?: number }>('/api/messages/activity', {
    method: 'POST',
    body: JSON.stringify(batch),
  });
}

/**
 * Upload a channel's daily counts in one batch per calendar year, so no
 * request gets too big. Each batch replaces its year's counts; the last one
 * is marked final so the server re-matches handles.
 */
export async function uploadActivity(
  channel: MessageChannel,
  from: string,
  to: string,
  handles: ActivityUpload['handles'],
  activity: ActivityUpload['activity'],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  const total = lastYear - firstYear + 1;
  const byHandle = new Map(handles.map(h => [h.handle, h]));
  for (let year = firstYear; year <= lastYear; year++) {
    const yearFrom = year === firstYear ? from : `${year}-01-01`;
    const yearTo = year === lastYear ? to : `${year}-12-31`;
    const rows = activity.filter(a => a.day >= yearFrom && a.day <= yearTo);
    const used = new Set(rows.map(r => r.handle));
    await postActivity({
      channel,
      from: yearFrom,
      to: yearTo,
      handles: [...used].map(h => byHandle.get(h) ?? { handle: h }),
      activity: rows,
      final: year === lastYear,
    });
    onProgress?.(year - firstYear + 1, total);
  }
}

export function useInvalidateMessageQueries() {
  return useInvalidateMessages();
}

/** How far back "Scan older emails" goes */
export type GmailOlderRange = '5y' | '10y' | 'all';

/** Start a Gmail scan: new mail, or with `older` mail before what's covered */
export function useStartGmailScan() {
  const invalidate = useInvalidateMessages();
  return useMutation({
    mutationFn: (older?: GmailOlderRange) => fetchApi<{ started: boolean }>('/api/messages/gmail/scan', {
      method: 'POST',
      body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(older ? { older } : {}) }),
    }),
    onSettled: invalidate,
  });
}

export function useClearChannel() {
  const invalidate = useInvalidateMessages();
  return useMutation({
    mutationFn: (channel: MessageChannel) => fetchApi<{ ok: boolean }>(`/api/messages/sources/${channel}`, { method: 'DELETE' }),
    onSettled: invalidate,
  });
}

export function useLinkHandles() {
  const invalidate = useInvalidateMessages();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { handles: HandleRef[]; contactId: number; addToContact: boolean }) =>
      fetchApi<{ linked: number; added: number }>('/api/messages/handles/link', { method: 'POST', body: JSON.stringify(args) }),
    onSettled: (_data, _err, args) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['contact', args.contactId] });
    },
  });
}

export function useIgnoreHandles() {
  const invalidate = useInvalidateMessages();
  return useMutation({
    mutationFn: (handles: HandleRef[]) =>
      fetchApi<{ updated: number }>('/api/messages/handles/ignore', { method: 'POST', body: JSON.stringify({ handles }) }),
    onSettled: invalidate,
  });
}

export function useUnlinkHandles() {
  const invalidate = useInvalidateMessages();
  return useMutation({
    mutationFn: (handles: HandleRef[]) =>
      fetchApi<{ updated: number }>('/api/messages/handles/unlink', { method: 'POST', body: JSON.stringify({ handles }) }),
    onSettled: invalidate,
  });
}

export function useAcceptAllSuggestions() {
  const invalidate = useInvalidateMessages();
  return useMutation({
    mutationFn: (channel?: MessageChannel) =>
      fetchApi<{ updated: number }>('/api/messages/handles/accept-suggestions', { method: 'POST', body: JSON.stringify({ channel }) }),
    onSettled: invalidate,
  });
}
