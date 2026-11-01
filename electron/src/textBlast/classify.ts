import type { OutgoingMessage, RecipientStatus } from './types';

/**
 * Turn a Messages database row into a Text Blast status (ported from TextBlast's classify).
 * Returns null while it's still unclear and `final` is false (keep polling).
 */
export function classify(m: OutgoingMessage, final: boolean): { status: RecipientStatus; note: string } | null {
  const svc = m.service ?? '';
  if (m.error) {
    return { status: 'failed', note: `Messages error ${m.error}${m.error === 22 ? ' (Not Delivered)' : ''}` };
  }
  if (m.is_delivered) return { status: 'delivered', note: 'delivered' };
  if (m.is_sent && (svc === 'SMS' || svc === 'RCS')) {
    return { status: 'sent_sms', note: `sent as ${svc} through your iPhone (SMS has no delivery receipts)` };
  }
  if (final) {
    if (m.is_sent) return { status: 'sent', note: 'sent; no delivery receipt yet (their phone may be off)' };
    return { status: 'pending', note: 'still sending when Yello stopped waiting; check Messages' };
  }
  return null;
}
