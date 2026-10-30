/** Formatting for birthday lists (dashboard card and Birthdays page). */
import type { UpcomingBirthday } from '../api/dashboardHooks';
import type { ContactTile } from '../components/ContactTileGrid';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Apple's placeholder year for a birthday with no known year (X-APPLE-OMIT-YEAR). */
const APPLE_NO_YEAR = 1604;

/** The user's local date as YYYY-MM-DD, sent to the server so "today" matches their calendar. */
export function localToday(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Year (null when unknown), month and day of a stored birthday. */
export function parseBirthday(
  birthday: string
): { year: number | null; month: number; day: number } | null {
  const value = birthday.trim();
  let m = value.match(/^--(\d{1,2})-?(\d{1,2})$/) ?? value.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return { year: null, month: Number(m[1]), day: Number(m[2]) };
  m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ?? value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    return { year: year === APPLE_NO_YEAR ? null : year, month: Number(m[2]), day: Number(m[3]) };
  }
  return null;
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/** Date of the next occurrence, given how many days away it is. */
export function nextOccurrence(daysUntil: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil);
}

/** "March 4, 40th Birthday" when the year is known, otherwise "4 March". */
export function formatBirthdayLine(birthday: string, daysUntil: number): string {
  const parsed = parseBirthday(birthday);
  if (!parsed) return birthday;
  const monthName = MONTH_NAMES[parsed.month - 1] ?? '';
  if (parsed.year) {
    const age = nextOccurrence(daysUntil).getFullYear() - parsed.year;
    if (age > 0) return `${monthName} ${parsed.day}, ${age}${ordinalSuffix(age)} Birthday`;
  }
  return `${parsed.day} ${monthName}`;
}

/** "Today!", "Tomorrow" or "In 5 days". */
export function formatDaysUntil(daysUntil: number): string {
  if (daysUntil === 0) return 'Today!';
  if (daysUntil === 1) return 'Tomorrow';
  return `In ${daysUntil} days`;
}

/** A birthday as a ContactTileGrid tile: days-until on top of the tooltip, then the date. */
export function birthdayTile(b: UpcomingBirthday): ContactTile {
  return {
    key: b.id,
    contactId: b.id,
    displayName: b.displayName,
    photoHash: b.photoHash,
    tipTitle: formatDaysUntil(b.daysUntil),
    tipText: formatBirthdayLine(b.birthday, b.daysUntil),
  };
}
