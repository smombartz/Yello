import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useState, useCallback, useRef } from 'react';
import { fetchApi } from './client';
import type {
  GmailSyncSummary,
  GmailDiscoveryResult,
  GmailBulkSyncProgress,
  GmailBulkSyncResult,
} from './types';

/**
 * Hook to fetch Gmail sync summary stats
 */
export function useGmailSyncSummary() {
  return useQuery({
    queryKey: ['gmailSyncSummary'],
    queryFn: () => fetchApi<GmailSyncSummary>('/api/enrich/gmail/summary'),
  });
}

/**
 * Hook to discover contacts by Gmail activity
 */
export function useGmailDiscover() {
  return useMutation({
    mutationFn: (params: { strategy: 'recent' | 'frequent'; scanDepth?: number }) =>
      fetchApi<GmailDiscoveryResult>('/api/enrich/gmail/discover', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  });
}

/**
 * Hook for SSE-streamed bulk Gmail sync (same pattern as useLinkedInEnrichment)
 */
export function useGmailBulkSync() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<GmailBulkSyncProgress | null>(null);
  const [result, setResult] = useState<GmailBulkSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startSync = useCallback(async (
    params: { contactIds?: number[]; strategy?: 'all' | 'unsynced'; limit: number },
    onComplete?: (result: GmailBulkSyncResult) => void,
    onError?: (error: string) => void,
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsSyncing(true);
    setProgress(null);
    setResult(null);
    setError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/enrich/gmail/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Bulk sync failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;
          const lines = eventBlock.split('\n');
          let eventType = '';
          let eventData = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            else if (line.startsWith('data: ')) eventData = line.slice(6);
          }
          if (!eventType || !eventData) continue;
          try {
            const data = JSON.parse(eventData);
            if (eventType === 'progress') {
              setProgress(data as GmailBulkSyncProgress);
            } else if (eventType === 'complete') {
              const completeResult = data as GmailBulkSyncResult;
              setResult(completeResult);
              setIsSyncing(false);
              setProgress(null);
              queryClient.invalidateQueries({ queryKey: ['gmailSyncSummary'] });
              queryClient.invalidateQueries({ queryKey: ['contacts'] });
              if (onComplete) onComplete(completeResult);
            } else if (eventType === 'error') {
              const errorMsg = data.error || 'Bulk sync failed';
              setError(errorMsg);
              setIsSyncing(false);
              if (onError) onError(errorMsg);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorMsg = err instanceof Error ? err.message : 'Bulk sync failed';
      setError(errorMsg);
      setIsSyncing(false);
      if (onError) onError(errorMsg);
    } finally {
      abortControllerRef.current = null;
    }
  }, [queryClient]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSyncing(false);
    setProgress(null);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  return { isSyncing, progress, result, error, startSync, cancel, reset };
}
