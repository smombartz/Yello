import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef } from 'react';
import { fetchApi } from './client';

export function exportAllContacts(): void {
  window.open('/api/contacts/export/vcf', '_blank');
}

export function useDeleteAllContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<{ deletedCount: number }>('/api/contacts/all', {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
    },
  });
}

export interface FetchContactPhotosResult {
  matched: number;
  downloaded: number;
  failed: number;
  skipped: number;
}

export interface ProgressUpdate {
  current: number;
  total: number;
  downloaded: number;
  failed: number;
  skipped: number;
}

export function useFetchContactPhotos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<FetchContactPhotosResult>('/api/settings/fetch-contact-photos', {
        method: 'POST',
      }),
    onSuccess: () => {
      // Invalidate contacts to refresh any that now have photos
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export interface LinkedInImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface LinkedInProgressUpdate {
  current: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface LinkedInContact {
  firstName: string;
  lastName: string;
  linkedinUrl: string;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
}

/**
 * Parse LinkedIn CSV content into contact objects.
 * LinkedIn CSV format:
 * - Lines 1-3: Notes/header
 * - Line 4: Column headers: First Name,Last Name,URL,Email Address,Company,Position,Connected On
 * - Lines 5+: Data rows
 */
export function parseLinkedInCsv(csvContent: string): LinkedInContact[] {
  const lines = csvContent.split('\n');
  const contacts: LinkedInContact[] = [];

  // Skip first 4 lines (notes + header)
  for (let i = 4; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    if (fields.length < 7) continue;

    const [firstName, lastName, url, email, company, position, connectedOn] = fields;

    // Skip if no URL (invalid row)
    if (!url?.trim()) continue;

    contacts.push({
      firstName: firstName?.trim() || '',
      lastName: lastName?.trim() || '',
      linkedinUrl: url?.trim() || '',
      email: email?.trim() || null,
      company: company?.trim() || null,
      position: position?.trim() || null,
      connectedOn: connectedOn?.trim() || null,
    });
  }

  return contacts;
}

/**
 * Parse a single CSV line, handling quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

export function useImportLinkedInStream() {
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<LinkedInProgressUpdate | null>(null);
  const [importResult, setImportResult] = useState<LinkedInImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startImport = useCallback(async (
    contacts: LinkedInContact[],
    onComplete?: (result: LinkedInImportResult) => void,
    onError?: (error: string) => void
  ) => {
    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsImporting(true);
    setProgress(null);
    setImportResult(null);
    setError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/settings/import-linkedin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contacts }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Import failed');
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
              setProgress(data as LinkedInProgressUpdate);
            } else if (eventType === 'complete') {
              const result = data as LinkedInImportResult;
              setImportResult(result);
              setIsImporting(false);
              setProgress(null);

              // Invalidate contacts to refresh the list
              queryClient.invalidateQueries({ queryKey: ['contacts'] });
              queryClient.invalidateQueries({ queryKey: ['contactCount'] });

              if (onComplete) {
                onComplete(result);
              }
            } else if (eventType === 'error') {
              const errorMsg = data.error || 'Import failed';
              setError(errorMsg);
              setIsImporting(false);
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
      const errorMsg = err instanceof Error ? err.message : 'Import failed';
      setError(errorMsg);
      setIsImporting(false);
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
    setIsImporting(false);
    setProgress(null);
  }, []);

  const reset = useCallback(() => {
    setImportResult(null);
    setError(null);
    setProgress(null);
  }, []);

  return {
    isImporting,
    progress,
    importResult,
    error,
    startImport,
    cancel,
    reset,
  };
}

export function useFetchContactPhotosStream() {
  const queryClient = useQueryClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startFetching = useCallback((
    onComplete?: (result: FetchContactPhotosResult) => void,
    onError?: (error: string) => void
  ) => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsStreaming(true);
    setProgress(null);
    setError(null);

    const eventSource = new EventSource('/api/settings/fetch-contact-photos-stream');
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data) as ProgressUpdate;
      setProgress(data);
    });

    eventSource.addEventListener('complete', (event) => {
      const result = JSON.parse(event.data) as FetchContactPhotosResult;
      setIsStreaming(false);
      setProgress(null);
      eventSource.close();
      eventSourceRef.current = null;

      // Invalidate contacts to refresh any that now have photos
      queryClient.invalidateQueries({ queryKey: ['contacts'] });

      if (onComplete) {
        onComplete(result);
      }
    });

    eventSource.addEventListener('error', (event) => {
      // Check if it's an SSE error event with data
      if (event instanceof MessageEvent) {
        const data = JSON.parse(event.data) as { error: string };
        setError(data.error);
        if (onError) {
          onError(data.error);
        }
      } else {
        // Connection error
        setError('Connection lost');
        if (onError) {
          onError('Connection lost');
        }
      }
      setIsStreaming(false);
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.onerror = () => {
      // Only handle if still streaming (not already closed by error event)
      if (isStreaming && eventSourceRef.current) {
        setError('Connection lost');
        setIsStreaming(false);
        eventSource.close();
        eventSourceRef.current = null;
        if (onError) {
          onError('Connection lost');
        }
      }
    };
  }, [queryClient, isStreaming]);

  const cancel = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
    setProgress(null);
  }, []);

  return {
    isStreaming,
    progress,
    error,
    startFetching,
    cancel,
  };
}
