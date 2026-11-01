import { session } from 'electron';
import { APP_URL } from '../config';
import type { RunnerApi } from './runner';
import type { Blast } from './types';

// Backend calls made by the sending engine, as the signed-in user: session.fetch sends
// the app's session cookie, the same one the window uses.

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await session.defaultSession.fetch(`${APP_URL}/api/text-blasts${path}`, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let message = `Yello answered ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* keep the status message */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

function localMidnightIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export const textBlastApi: RunnerApi = {
  async getBlast(id) {
    return (await call<{ blast: Blast }>(`/${id}`)).blast;
  },
  async setRecipientStatus(blastId, recipientId, update) {
    await call(`/${blastId}/recipients/${recipientId}/status`, { method: 'POST', body: update });
  },
  async setBlastStatus(blastId, status) {
    await call(`/${blastId}/status`, { method: 'POST', body: { status } });
  },
  async sentToday() {
    return call<{ count: number; cap: number }>(`/sent-today?since=${encodeURIComponent(localMidnightIso())}`);
  },
};
