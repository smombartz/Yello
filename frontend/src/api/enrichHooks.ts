import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef } from 'react';
import { fetchApi } from './client';
import type {
  LinkedInEnrichmentSummary,
  LinkedInEnrichmentProgress,
  LinkedInEnrichmentResult,
  EnrichmentCategoryResponse,
} from './types';

/**
 * Hook to fetch LinkedIn enrichment summary
 */
export function useLinkedInEnrichmentSummary(includeAlreadyEnriched: boolean = false) {
  return useQuery({
    queryKey: ['linkedinEnrichmentSummary', includeAlreadyEnriched],
    queryFn: () =>
      fetchApi<LinkedInEnrichmentSummary>(
        `/api/enrich/linkedin/summary?includeAlreadyEnriched=${includeAlreadyEnriched}`
      ),
  });
}

/**
 * Hook to fetch contacts by enrichment category
 */
export function useEnrichmentCategoryContacts(category: string | null) {
  return useQuery({
    queryKey: ['enrichment-category', category],
    queryFn: () =>
      fetchApi<EnrichmentCategoryResponse>(
        `/api/enrich/linkedin/contacts?category=${category}`
      ),
    enabled: !!category,
  });
}

/**
 * Hook to run LinkedIn enrichment with SSE streaming progress
 */
export function useLinkedInEnrichment() {
  const queryClient = useQueryClient();
  const [isEnriching, setIsEnriching] = useState(false);
  const [progress, setProgress] = useState<LinkedInEnrichmentProgress | null>(null);
  const [result, setResult] = useState<LinkedInEnrichmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startEnrichment = useCallback(async (
    includeAlreadyEnriched: boolean,
    onComplete?: (result: LinkedInEnrichmentResult) => void,
    onError?: (error: string) => void,
    limit?: number
  ) => {
    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsEnriching(true);
    setProgress(null);
    setResult(null);
    setError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/enrich/linkedin/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ includeAlreadyEnriched, limit }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Enrichment failed');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;

          const lines = eventBlock.split('\n');
          let eventType = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }

          if (!eventType || !eventData) continue;

          try {
            const data = JSON.parse(eventData);

            if (eventType === 'progress') {
              setProgress(data as LinkedInEnrichmentProgress);
            } else if (eventType === 'complete') {
              const completeResult = data as LinkedInEnrichmentResult;
              setResult(completeResult);
              setIsEnriching(false);
              setProgress(null);

              // Invalidate contacts to refresh the list
              queryClient.invalidateQueries({ queryKey: ['contacts'] });
              queryClient.invalidateQueries({ queryKey: ['linkedinEnrichmentSummary'] });
              queryClient.invalidateQueries({ queryKey: ['enrichment-category'] });

              if (onComplete) {
                onComplete(completeResult);
              }
            } else if (eventType === 'error') {
              const errorMsg = data.error || 'Enrichment failed';
              setError(errorMsg);
              setIsEnriching(false);
              if (onError) {
                onError(errorMsg);
              }
            }
          } catch {
            // Ignore JSON parse errors
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled
        return;
      }
      const errorMsg = err instanceof Error ? err.message : 'Enrichment failed';
      setError(errorMsg);
      setIsEnriching(false);
      if (onError) {
        onError(errorMsg);
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [queryClient]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsEnriching(false);
    setProgress(null);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  return {
    isEnriching,
    progress,
    result,
    error,
    startEnrichment,
    cancel,
    reset,
  };
}

/**
 * Hook to recover enrichment data from an existing Apify dataset
 */
export function useLinkedInRecovery() {
  const queryClient = useQueryClient();
  const [isRecovering, setIsRecovering] = useState(false);
  const [progress, setProgress] = useState<LinkedInEnrichmentProgress | null>(null);
  const [result, setResult] = useState<LinkedInEnrichmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startRecovery = useCallback(async (
    datasetId: string,
    onComplete?: (result: LinkedInEnrichmentResult) => void,
    onError?: (error: string) => void,
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsRecovering(true);
    setProgress(null);
    setResult(null);
    setError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/enrich/linkedin/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Recovery failed');
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
              setProgress(data as LinkedInEnrichmentProgress);
            } else if (eventType === 'complete') {
              const completeResult = data as LinkedInEnrichmentResult;
              setResult(completeResult);
              setIsRecovering(false);
              setProgress(null);
              queryClient.invalidateQueries({ queryKey: ['contacts'] });
              queryClient.invalidateQueries({ queryKey: ['linkedinEnrichmentSummary'] });
              queryClient.invalidateQueries({ queryKey: ['enrichment-category'] });
              if (onComplete) onComplete(completeResult);
            } else if (eventType === 'error') {
              const errorMsg = data.error || 'Recovery failed';
              setError(errorMsg);
              setIsRecovering(false);
              if (onError) onError(errorMsg);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorMsg = err instanceof Error ? err.message : 'Recovery failed';
      setError(errorMsg);
      setIsRecovering(false);
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
    setIsRecovering(false);
    setProgress(null);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  return { isRecovering, progress, result, error, startRecovery, cancel, reset };
}
