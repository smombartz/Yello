import { useEffect, useState } from 'react';
import type { DesktopProgress } from '../../api/textBlastHooks';

// Mirrors the desktop app's pacing (electron/src/textBlast/runner.ts): a random 25–45 s pause
// between texts (1–2 s when simulating), plus the send itself and the delivery check.
const GAP_SECONDS = { real: 35, simulate: 1.5 };
// Until a send has been timed on this page: AppleScript plus a couple of chat.db polls.
const SEND_SECONDS = { real: 8, simulate: 0.3 };

/** Rough time for `count` texts in a fresh run (the first one has no pause before it). */
export function estimateRunSeconds(count: number, simulate: boolean): number {
  if (count <= 0) return 0;
  const send = simulate ? SEND_SECONDS.simulate : SEND_SECONDS.real;
  const gap = simulate ? GAP_SECONDS.simulate : GAP_SECONDS.real;
  return count * send + (count - 1) * gap;
}

/** "45 s", "12 min", "1 h 20 min". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Ticking countdown: "4:05" or "1:02:09". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export interface LiveEstimate {
  /** 'waiting' = pausing before the next text, 'sending' = a text is going out now. */
  phase: 'waiting' | 'sending' | 'idle';
  /** Seconds until the next text goes out (while waiting). */
  nextIn: number | null;
  /** Seconds until the texts that can go out today are done. */
  secondsLeft: number;
  /** Texts the estimate covers: what's left, or fewer when today's limit stops the run first. */
  coveredTexts: number;
  /** True when today's limit will stop the run before everyone is sent to. */
  limitedByCap: boolean;
  finishAt: Date;
}

/**
 * Live time-left estimate for a running blast, recomputed every second. Send times are measured
 * on this page as texts go out, so the estimate settles after the first couple of texts.
 */
export function useLiveEstimate(progress: DesktopProgress | null, limitLeft: number | null): LiveEstimate | null {
  const [now, setNow] = useState(() => Date.now());
  const running = !!progress?.running;
  const sending = running && !!progress?.current && !progress?.nextAt;
  const attempts = (progress?.sent ?? 0) + (progress?.failed ?? 0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Time each send, from when it starts until the sent/failed count goes up (to the second).
  const [track, setTrack] = useState({ attempts, sending, since: null as number | null, times: [] as number[] });
  if (attempts !== track.attempts || sending !== track.sending) {
    const times = attempts > track.attempts && track.since !== null
      ? [...track.times, (now - track.since) / 1000].slice(-10)
      : track.times;
    const stillSameSend = sending && track.sending && attempts === track.attempts;
    setTrack({ attempts, sending, since: sending ? (stillSameSend ? track.since : now) : null, times });
  }
  const sendTimes = track.times;

  if (!progress?.running) return null;

  const mode = progress.simulate ? 'simulate' : 'real';
  const send = sendTimes.length ? sendTimes.reduce((a, b) => a + b, 0) / sendTimes.length : SEND_SECONDS[mode];
  const gap = GAP_SECONDS[mode];
  const remaining = Math.max(0, progress.total - progress.processed);
  const cap = progress.simulate || limitLeft === null ? remaining : Math.max(0, limitLeft);
  const covered = Math.min(remaining, cap);

  let phase: LiveEstimate['phase'] = 'idle';
  let nextIn: number | null = null;
  let secondsLeft = 0;
  if (covered > 0) {
    const after = (covered - 1) * (gap + send);
    if (progress.nextAt) {
      phase = 'waiting';
      nextIn = Math.max(0, (progress.nextAt - now) / 1000);
      secondsLeft = nextIn + send + after;
    } else if (progress.current) {
      phase = 'sending';
      const elapsed = track.since !== null ? (now - track.since) / 1000 : 0;
      secondsLeft = Math.max(1, send - elapsed) + after;
    } else {
      secondsLeft = send + after;
    }
  }

  return {
    phase,
    nextIn,
    secondsLeft,
    coveredTexts: covered,
    limitedByCap: covered < remaining,
    finishAt: new Date(now + secondsLeft * 1000),
  };
}
