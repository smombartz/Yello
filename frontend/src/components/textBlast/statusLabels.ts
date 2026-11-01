import type { BlastStatus, RecipientStatus } from '../../api/textBlastHooks';

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info';

export const RECIPIENT_STATUS: Record<RecipientStatus, { label: string; variant: BadgeVariant; hint: string }> = {
  '': { label: 'Queued', variant: 'neutral', hint: 'Not sent yet' },
  in_flight: { label: 'Sending', variant: 'info', hint: 'Handed to Messages; waiting for the result' },
  delivered: { label: 'Delivered', variant: 'success', hint: 'iMessage delivered to their device' },
  sent: { label: 'Sent', variant: 'success', hint: 'iMessage sent, no delivery receipt yet (phone off?)' },
  sent_sms: { label: 'Sent as SMS', variant: 'success', hint: 'Sent as SMS through your iPhone. SMS has no delivery receipts.' },
  dispatched: { label: 'Sent (not checked)', variant: 'success', hint: 'Handed to Messages; delivery not checked (no Full Disk Access)' },
  failed: { label: 'Failed', variant: 'error', hint: 'Messages reported "Not Delivered". Retried when you resume.' },
  error: { label: 'Error', variant: 'error', hint: 'Messages refused the send. Retried when you resume.' },
  pending: { label: 'Check Messages', variant: 'warning', hint: 'Unclear whether it went out. Look in Messages.' },
  not_found: { label: 'Check Messages', variant: 'warning', hint: 'Messages accepted it but it never showed up. Look in Messages.' },
  needs_review: { label: 'Check Messages', variant: 'warning', hint: "Interrupted mid-send and couldn't be checked. Look in Messages." },
  skipped: { label: 'Skipped', variant: 'neutral', hint: 'Left out of this blast' },
  simulated: { label: 'Simulated', variant: 'info', hint: 'Simulation only; nothing was sent' },
};

export const BLAST_STATUS: Record<BlastStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Not started', variant: 'neutral' },
  running: { label: 'Sending', variant: 'info' },
  stopped: { label: 'Stopped', variant: 'warning' },
  finished: { label: 'Finished', variant: 'success' },
};

export const COUNTRIES: { code: string; label: string }[] = [
  { code: 'US', label: 'United States / Canada (+1)' },
  { code: 'DE', label: 'Germany (+49)' },
  { code: 'MT', label: 'Malta (+356)' },
  { code: 'GB', label: 'United Kingdom (+44)' },
  { code: 'FR', label: 'France (+33)' },
  { code: 'ES', label: 'Spain (+34)' },
  { code: 'IT', label: 'Italy (+39)' },
  { code: 'NL', label: 'Netherlands (+31)' },
  { code: 'AT', label: 'Austria (+43)' },
  { code: 'CH', label: 'Switzerland (+41)' },
  { code: 'IE', label: 'Ireland (+353)' },
  { code: 'PT', label: 'Portugal (+351)' },
  { code: 'BE', label: 'Belgium (+32)' },
  { code: 'DK', label: 'Denmark (+45)' },
  { code: 'SE', label: 'Sweden (+46)' },
  { code: 'NO', label: 'Norway (+47)' },
  { code: 'AU', label: 'Australia (+61)' },
  { code: 'MX', label: 'Mexico (+52)' },
];

/** "Delivered 12 · Failed 1 · Queued 30" for a blast's counts. */
export function summarizeCounts(counts: Partial<Record<RecipientStatus, number>>): string {
  const groups: [string, RecipientStatus[]][] = [
    ['sent', ['delivered', 'sent', 'sent_sms', 'dispatched']],
    ['simulated', ['simulated']],
    ['failed', ['failed', 'error']],
    ['to check', ['pending', 'not_found', 'needs_review', 'in_flight']],
    ['queued', ['']],
    ['skipped', ['skipped']],
  ];
  return groups
    .map(([label, statuses]) => [label, statuses.reduce((n, s) => n + (counts[s] ?? 0), 0)] as const)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${n} ${label}`)
    .join(' · ');
}
