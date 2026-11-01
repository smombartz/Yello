import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { fetchApi } from '../api/client';
import { useInvalidateMessageQueries, type MessageSource } from '../api/messageHooks';
import {
  AUTO_REFRESH_EVENT, getAutoRefresh, getDesktopMessages, getLastScan, setAutoRefresh, syncDesktopChannel,
  type DesktopChannel,
} from '../lib/desktopMessages';

const CHANNELS: DesktopChannel[] = ['imessage', 'whatsapp'];
/** A channel is refreshed once its last read on this Mac is this old */
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
/** How often to check whether a refresh is due */
const CHECK_EVERY_MS = 15 * 60 * 1000;
/** Wait a little after launch so the app's first screen loads first */
const FIRST_DELAY_MS = 20 * 1000;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(AUTO_REFRESH_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(AUTO_REFRESH_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The per-Mac "Refresh automatically" switch for one channel (off by default). */
export function useDesktopAutoRefresh(channel: DesktopChannel): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => getAutoRefresh(channel));
  const set = useCallback((value: boolean) => setAutoRefresh(channel, value), [channel]);
  return [on, set];
}

/**
 * In the desktop app: keep iMessage and WhatsApp counts current for the
 * channels whose "Refresh automatically" switch is on. Checks shortly after
 * launch, every 15 minutes and whenever a switch changes, and reads a channel
 * when its last read on this Mac is 6+ hours old. Only channels scanned once
 * already qualify (the first scan is always the user's own click), and each
 * refresh reads only the days since the last import.
 */
export function useDesktopMessageSync(enabled: boolean): void {
  const invalidate = useInvalidateMessageQueries();

  useEffect(() => {
    const desktop = getDesktopMessages();
    if (!enabled || !desktop) return;
    let running = false;

    const run = async () => {
      const due = CHANNELS.filter(c => getAutoRefresh(c) && Date.now() - (getLastScan(c) ?? 0) >= REFRESH_AFTER_MS);
      if (running || !due.length) return;
      running = true;
      try {
        const [{ sources }, status] = await Promise.all([
          fetchApi<{ sources: MessageSource[] }>('/api/messages/sources'),
          desktop.status(),
        ]);
        let changed = false;
        for (const channel of due) {
          const source = sources.find(s => s.channel === channel);
          if (!source?.coveredThrough || status[channel]?.state !== 'ready') continue;
          try {
            const result = await syncDesktopChannel(channel, source.coveredThrough);
            if (result?.messages) changed = true;
          } catch (err) {
            console.warn(`[Top contacts] ${channel} refresh failed`, err);
          }
        }
        if (changed) invalidate();
      } catch (err) {
        console.warn('[Top contacts] desktop refresh failed', err);
      } finally {
        running = false;
      }
    };

    const first = window.setTimeout(() => void run(), FIRST_DELAY_MS);
    const every = window.setInterval(() => void run(), CHECK_EVERY_MS);
    const onSwitch = () => void run();
    window.addEventListener(AUTO_REFRESH_EVENT, onSwitch);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.removeEventListener(AUTO_REFRESH_EVENT, onSwitch);
    };
    // invalidate is stable enough; re-running on its identity would reset the timers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
