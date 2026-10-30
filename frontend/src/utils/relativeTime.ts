/**
 * Server timestamps are UTC. SQLite's `YYYY-MM-DD HH:MM:SS` carries no zone, and the
 * browser reads that as local time, which put fresh contacts in the future west of UTC
 * ("-1 days ago"). Read it as UTC; ISO strings with a zone pass through.
 */
export function parseServerTime(value: string): Date {
  const bare = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/);
  return new Date(bare ? `${bare[1]}T${bare[2]}Z` : value);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days between the date and today, in the user's time zone; never negative. */
export function daysAgo(date: Date, now = new Date()): number {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}

/** "Today, 3:14 PM", "Yesterday, 9:02 AM", "3 days ago", then "Oct 12" (or "Oct 12, 2025"). */
export function formatRelativeDay(value: string, now = new Date()): string {
  const date = parseServerTime(value);
  if (Number.isNaN(date.getTime())) return '';
  const days = daysAgo(date, now);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}
