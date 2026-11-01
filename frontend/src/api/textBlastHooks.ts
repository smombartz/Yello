import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

// Tools › Text Blast (docs/plans/2026-10-31-text-blast.md). The backend builds lists and
// keeps statuses; the desktop app (window.yelloDesktop) does the sending.

export type RecipientStatus = '' | 'in_flight' | 'delivered' | 'sent' | 'sent_sms' | 'dispatched' | 'failed'
  | 'error' | 'pending' | 'not_found' | 'needs_review' | 'skipped' | 'simulated';
export type BlastStatus = 'draft' | 'running' | 'stopped' | 'finished';

export interface PreviewRecipient {
  key: string;
  contactId: number | null;
  name: string;
  source: 'group' | 'csv' | 'both';
  csvRow: number | null;
  phone: string | null;
  phones: { e164: string; label: string }[];
  text: string;
  isCustom: boolean;
  problems: string[];
}

export interface PreviewResult {
  recipients: PreviewRecipient[];
  fields: string[];
  csv: { name: string; rows: number; phoneColumn: string | null; overrideColumn: string | null } | null;
}

export interface BuildInput {
  groups: string[];
  csv: { name: string; text: string } | null;
  template: string;
  country: string;
  phoneOverrides: Record<string, string>;
}

export interface BlastRecipient {
  id: number;
  contactId: number | null;
  position: number;
  name: string;
  phone: string;
  text: string;
  isCustom: boolean;
  source: 'group' | 'csv' | 'both';
  status: RecipientStatus;
  service: string | null;
  sentAt: string | null;
  note: string | null;
}

export interface Blast {
  id: number;
  createdAt: string;
  template: string;
  country: string;
  simulate: boolean;
  status: BlastStatus;
  sources: { groups: string[]; csvName: string | null };
  total: number;
  counts: Partial<Record<RecipientStatus, number>>;
  recipients?: BlastRecipient[];
}

/** Picked up when a blast is started or resumed. */
export const TO_SEND: RecipientStatus[] = ['', 'failed', 'error', 'simulated', 'in_flight'];
export const DONE: RecipientStatus[] = ['delivered', 'sent', 'sent_sms', 'dispatched'];

// ---- Backend ----

export function useTextBlastPreview(input: BuildInput, csvVersion: number, enabled: boolean) {
  return useQuery({
    // The CSV text can be large, so the key carries a version number instead of the text.
    queryKey: ['textBlastPreview', input.groups, csvVersion, input.template, input.country, input.phoneOverrides],
    queryFn: () => fetchApi<PreviewResult>('/api/text-blasts/preview', { method: 'POST', body: JSON.stringify(input) }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useBlasts() {
  return useQuery({
    queryKey: ['textBlasts'],
    queryFn: () => fetchApi<{ blasts: Blast[] }>('/api/text-blasts').then((r) => r.blasts),
  });
}

export function useBlast(id: number | null, poll: boolean) {
  return useQuery({
    queryKey: ['textBlast', id],
    queryFn: () => fetchApi<{ blast: Blast }>(`/api/text-blasts/${id}`).then((r) => r.blast),
    enabled: id !== null,
    refetchInterval: poll ? 2000 : false,
  });
}

function localMidnightIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Attempts today and in the last 60 minutes, against the user's limits. */
export interface SendCounts {
  count: number;
  cap: number;
  hourCount: number;
  hourCap: number;
  /** ISO time the oldest attempt in a full hour drops out. */
  hourResetAt: string | null;
}

export function useSentToday() {
  return useQuery({
    queryKey: ['textBlastSentToday'],
    queryFn: () => fetchApi<SendCounts>(`/api/text-blasts/sent-today?since=${encodeURIComponent(localMidnightIso())}`),
    refetchInterval: 30_000,
  });
}

export interface SendLimits { daily: number; hourly: number }
export const LIMIT_RANGE = { daily: [1, 1000], hourly: [1, 200] } as const;

export function useSendLimits() {
  return useQuery({
    queryKey: ['textBlastLimits'],
    queryFn: () => fetchApi<{ limits: SendLimits }>('/api/text-blasts/settings').then((r) => r.limits),
  });
}

export function useSaveSendLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (limits: SendLimits) =>
      fetchApi<{ limits: SendLimits }>('/api/text-blasts/settings', { method: 'PUT', body: JSON.stringify(limits) }).then((r) => r.limits),
    onSuccess: (limits) => {
      queryClient.setQueryData(['textBlastLimits'], limits);
      queryClient.invalidateQueries({ queryKey: ['textBlastSentToday'] });
    },
  });
}

export function normalizeTestPhone(phone: string, country: string) {
  return fetchApi<{ e164: string } | { problem: string }>(
    `/api/text-blasts/normalize?phone=${encodeURIComponent(phone)}&country=${country}`,
  );
}

export function useCreateBlast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BuildInput & { simulate: boolean; excludeKeys: string[] }) =>
      fetchApi<{ blast: Blast }>('/api/text-blasts', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.blast),
    onSuccess: (blast) => {
      queryClient.setQueryData(['textBlast', blast.id], blast);
      queryClient.invalidateQueries({ queryKey: ['textBlasts'] });
    },
  });
}

function useBlastMutation<V>(fn: (vars: V) => Promise<unknown>, blastId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textBlast', blastId] });
      queryClient.invalidateQueries({ queryKey: ['textBlasts'] });
    },
  });
}

/** Untick (skip) or re-tick people who haven't been sent to. */
export function useSkipRecipients(blastId: number) {
  return useBlastMutation((v: { ids: number[]; skipped: boolean }) =>
    fetchApi(`/api/text-blasts/${blastId}/recipients/skip`, { method: 'POST', body: JSON.stringify(v) }), blastId);
}

/** Put someone back in the queue (e.g. after checking Messages for a "check Messages" row). */
export function useRequeueRecipient(blastId: number) {
  return useBlastMutation((recipientId: number) =>
    fetchApi(`/api/text-blasts/${blastId}/recipients/${recipientId}/status`, {
      method: 'POST', body: JSON.stringify({ status: '', note: null }),
    }), blastId);
}

export function useRerunBlast(blastId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { template: string; simulate: boolean }) =>
      fetchApi<{ blast: Blast }>(`/api/text-blasts/${blastId}/rerun`, { method: 'POST', body: JSON.stringify(v) }).then((r) => r.blast),
    onSuccess: (blast) => {
      queryClient.setQueryData(['textBlast', blast.id], blast);
      queryClient.invalidateQueries({ queryKey: ['textBlasts'] });
    },
  });
}

export function useDeleteBlast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchApi(`/api/text-blasts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['textBlasts'] }),
  });
}

// ---- Desktop app bridge (electron/src/preload.ts) ----

export interface DesktopSetup {
  macos: boolean;
  imessage: boolean | null;
  sms: boolean | null;
  accountsError: string | null;
  chatDb: boolean;
  chatDbError: string | null;
  checkedAt: string;
}

export interface DesktopProgress {
  running: boolean;
  blastId: number | null;
  simulate: boolean;
  total: number;
  processed: number;
  sent: number;
  failed: number;
  current: { recipientId: number; name: string; phone: string } | null;
  nextAt: number | null;
  /** Missing from desktop app builds older than the hourly limit. */
  waitReason?: 'pace' | 'hourly' | null;
  log: { at: number; level: 'info' | 'ok' | 'warn' | 'error'; text: string }[];
}

export interface DesktopSendResult { status: RecipientStatus; service: string; note: string }

interface DesktopTextBlast {
  setup(refresh?: boolean): Promise<DesktopSetup>;
  progress(): Promise<DesktopProgress>;
  start(blastId: number): Promise<DesktopProgress>;
  stop(): Promise<DesktopProgress>;
  testSend(phone: string, text: string, simulate: boolean): Promise<DesktopSendResult>;
  openSettings(pane: 'automation' | 'full-disk-access'): Promise<void>;
  onProgress(callback: (p: DesktopProgress) => void): () => void;
}

declare global {
  interface Window {
    yelloDesktop?: { textBlast?: DesktopTextBlast };
  }
}

function bridge(): DesktopTextBlast | null {
  return window.yelloDesktop?.textBlast ?? null;
}

/** The desktop app's sender: null `api` in a regular browser. */
export function useDesktopTextBlast() {
  const api = bridge();
  const [setup, setSetup] = useState<DesktopSetup | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<DesktopProgress | null>(null);

  const refreshSetup = useCallback(async (refresh = true) => {
    const b = bridge();
    if (!b) return;
    setChecking(true);
    try {
      setSetup(await b.setup(refresh));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const b = bridge();
    if (!b) return;
    void refreshSetup(false);
    void b.progress().then(setProgress);
    return b.onProgress(setProgress);
  }, [refreshSetup]);

  return { api, setup, checking, refreshSetup, progress };
}
