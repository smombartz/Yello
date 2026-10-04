import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Search param holding the contact expanded in a list, e.g. `/contacts?contact=123`. */
export const EXPANDED_CONTACT_PARAM = 'contact';

type ParamUpdates = Record<string, string | null | undefined>;

/**
 * Returns a function that applies several search-param changes in one navigation.
 * A null, undefined or empty value removes the param.
 *
 * Replaces the history entry by default, so typing, sorting and expanding rows
 * don't pile up Back-button steps. React Router's setSearchParams has no update
 * queue, so batch related changes into a single call rather than calling twice.
 */
export function useSearchParamUpdater() {
  const [, setSearchParams] = useSearchParams();

  return useCallback((updates: ParamUpdates, options: { replace?: boolean } = {}) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
      }
      return next;
    }, { replace: options.replace ?? true });
  }, [setSearchParams]);
}
