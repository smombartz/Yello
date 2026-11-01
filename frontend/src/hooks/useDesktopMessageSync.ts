import { useEffect } from 'react';
import { fetchApi } from '../api/client';
import { useInvalidateMessageQueries, type MessageSource } from '../api/messageHooks';
import { getDesktopMessages, syncDesktopChannel, type DesktopChannel } from '../lib/desktopMessages';

const EVERY_MS = 6 * 60 * 60 * 1000;
/** Wait a little after launch so the app's first screen loads first */
const FIRST_DELAY_MS = 20 * 1000;

/**
 * In the desktop app: refresh iMessage and WhatsApp counts on launch and
 * every 6 hours, for channels the user already scanned once (the first
 * scan is always their own click on Top contacts › Sources).
 */
export function useDesktopMessageSync(enabled: boolean): void {
  const invalidate = useInvalidateMessageQueries();

  useEffect(() => {
    const desktop = getDesktopMessages();
    if (!enabled || !desktop) return;
    let running = false;

    const run = async () => {
      if (running) return;
      running = true;
      try {
        const [{ sources }, status] = await Promise.all([
          fetchApi<{ sources: MessageSource[] }>('/api/messages/sources'),
          desktop.status(),
        ]);
        let changed = false;
        for (const channel of ['imessage', 'whatsapp'] as DesktopChannel[]) {
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
    const every = window.setInterval(() => void run(), EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
    // invalidate is stable enough; re-running on its identity would reset the timers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
