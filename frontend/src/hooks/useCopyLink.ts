import { useCallback } from 'react';
import { useToast } from '../components/ui/Toast';

/** Returns a function that copies a URL to the clipboard and confirms with a toast. */
export function useCopyLink() {
  const { showToast } = useToast();

  return useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied', { duration: 2000 });
    } catch {
      showToast("Couldn't copy to clipboard", { type: 'error' });
    }
  }, [showToast]);
}
