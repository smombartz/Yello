function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function formatBirthday(dateString: string): string {
  // Handle various date formats
  let date: Date | null = null;
  let hasYear = true;

  // Try YYYYMMDD format (no separators)
  if (/^\d{8}$/.test(dateString)) {
    const year = parseInt(dateString.slice(0, 4));
    const month = parseInt(dateString.slice(4, 6)) - 1;
    const day = parseInt(dateString.slice(6, 8));
    date = new Date(year, month, day);
  }
  // Try --MM-DD format (year unknown)
  else if (/^--\d{2}-\d{2}$/.test(dateString)) {
    const month = parseInt(dateString.slice(2, 4)) - 1;
    const day = parseInt(dateString.slice(5, 7));
    // Use a placeholder year for display
    date = new Date(2000, month, day);
    hasYear = false;
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }
  // Try ISO format YYYY-MM-DD
  else if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    date = new Date(year, month - 1, day);
  }
  // Fallback for other formats
  else {
    date = new Date(dateString);
  }

  if (date && !isNaN(date.getTime())) {
    const formatted = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    if (hasYear) {
      const age = calculateAge(date);
      return `${formatted} (age ${age})`;
    }
    return formatted;
  }

  return dateString;
}

export function getZodiacSign(dateString: string): string | null {
  let month: number;
  let day: number;

  // Parse YYYYMMDD format
  if (/^\d{8}$/.test(dateString)) {
    month = parseInt(dateString.slice(4, 6));
    day = parseInt(dateString.slice(6, 8));
  }
  // Parse --MM-DD format
  else if (/^--\d{2}-\d{2}$/.test(dateString)) {
    month = parseInt(dateString.slice(2, 4));
    day = parseInt(dateString.slice(5, 7));
  }
  // Parse ISO format YYYY-MM-DD
  else if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [, m, d] = dateString.split('-').map(Number);
    month = m;
    day = d;
  }
  // Fallback for other formats
  else {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    month = date.getMonth() + 1;
    day = date.getDate();
  }

  // Zodiac sign date ranges
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'aries';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'taurus';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'gemini';
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'cancer';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'leo';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'virgo';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'libra';
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'scorpio';
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'sagittarius';
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'capricorn';
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'aquarius';
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return 'pisces';

  return null;
}

export function getPlatformIcon(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes('linkedin')) return 'linkedin';
  if (p.includes('twitter') || p.includes('x')) return 'x-twitter';
  if (p.includes('facebook')) return 'facebook';
  if (p.includes('instagram')) return 'instagram';
  if (p.includes('github')) return 'github';
  return 'link';
}

export function getPlatformIconStyle(platform: string): 'solid' | 'brands' {
  const p = platform.toLowerCase();
  if (p.includes('linkedin') || p.includes('twitter') || p.includes('x') ||
      p.includes('facebook') || p.includes('instagram') || p.includes('github')) {
    return 'brands';
  }
  return 'solid';
}

// Platform keys match the backend's (socialLinksCleanupService) and the stored
// lowercase values the contact filters query, e.g. platform = 'instagram'.
const SOCIAL_HOSTS: { platform: string; hosts: string[]; username: (segments: string[], url: URL) => string | undefined }[] = [
  { platform: 'linkedin', hosts: ['linkedin.com'], username: (s) => (s[0] === 'in' || s[0] === 'pub' ? s[1] : undefined) },
  {
    platform: 'facebook',
    hosts: ['facebook.com', 'fb.com'],
    username: (s, url) => (s[0] === 'profile.php' ? url.searchParams.get('id') ?? undefined : s[0]),
  },
  { platform: 'twitter', hosts: ['twitter.com', 'x.com'], username: (s) => s[0] },
  { platform: 'instagram', hosts: ['instagram.com'], username: (s) => s[0] },
  {
    platform: 'youtube',
    hosts: ['youtube.com'],
    username: (s) => (s[0]?.startsWith('@') ? s[0] : ['user', 'channel', 'c'].includes(s[0]) ? s[1] : undefined),
  },
  { platform: 'tiktok', hosts: ['tiktok.com'], username: (s) => (s[0]?.startsWith('@') ? s[0] : undefined) },
  { platform: 'pinterest', hosts: ['pinterest.com'], username: (s) => s[0] },
  { platform: 'snapchat', hosts: ['snapchat.com'], username: (s) => (s[0] === 'add' ? s[1] : undefined) },
  { platform: 'reddit', hosts: ['reddit.com'], username: (s) => (s[0] === 'user' || s[0] === 'u' ? s[1] : undefined) },
  { platform: 'github', hosts: ['github.com'], username: (s) => s[0] },
  { platform: 'threads', hosts: ['threads.net', 'threads.com'], username: (s) => (s[0]?.startsWith('@') ? s[0] : undefined) },
];

/**
 * Recognise a social profile URL: `https://www.instagram.com/someone/` →
 * `{ platform: 'instagram', username: 'someone' }`. Matches on the hostname
 * (so `dropbox.com` is not mistaken for `x.com`) and tolerates a missing scheme.
 */
export function detectSocialProfile(rawUrl: string): { platform: string; username: string | null } | null {
  const url = parseLooseUrl(rawUrl);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  const match = SOCIAL_HOSTS.find(({ hosts }) => hosts.some(h => host === h || host.endsWith(`.${h}`)));
  if (!match) return null;

  const username = match.username(pathSegments(url), url)?.replace(/^@/, '') || null;
  return { platform: match.platform, username };
}

/**
 * Platform and username for a profile saved with only its URL (both columns are
 * NOT NULL). Unknown sites use the host as the platform; the username falls back
 * to the URL's last path segment, as VCF import does.
 */
export function socialProfileFromUrl(rawUrl: string): { platform: string; username: string } {
  const detected = detectSocialProfile(rawUrl);
  const url = parseLooseUrl(rawUrl);
  const host = url?.hostname.toLowerCase().replace(/^www\./, '') || null;
  const lastSegment = url ? pathSegments(url).pop()?.replace(/^@/, '') || null : null;
  return {
    platform: detected?.platform ?? host ?? 'social',
    username: detected?.username ?? lastSegment ?? host ?? rawUrl.trim(),
  };
}

/** Parses a URL typed with or without its scheme (`instagram.com/x`). */
function parseLooseUrl(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

function pathSegments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean).map(seg => {
    try { return decodeURIComponent(seg); } catch { return seg; }
  });
}

export function getServiceIcon(service: string): string {
  const s = service.toLowerCase();
  if (s.includes('aim')) return 'comment';
  if (s.includes('facebook') || s.includes('messenger')) return 'comments';
  if (s.includes('jabber') || s.includes('xmpp')) return 'comment-dots';
  if (s.includes('skype')) return 'video';
  if (s.includes('icq')) return 'comment';
  return 'message';
}

export function getUrlIcon(url: string, label: string | null): string {
  const urlLower = url.toLowerCase();
  const labelLower = (label || '').toLowerCase();

  if (urlLower.includes('linkedin') || labelLower.includes('linkedin')) return 'briefcase';
  if (urlLower.includes('whatsapp') || labelLower.includes('whatsapp')) return 'comment';
  if (urlLower.includes('twitter') || urlLower.includes('x.com') || labelLower.includes('twitter')) return 'hashtag';
  if (urlLower.includes('facebook') || labelLower.includes('facebook')) return 'users';
  if (urlLower.includes('instagram') || labelLower.includes('instagram')) return 'camera';
  if (urlLower.includes('github') || labelLower.includes('github')) return 'code';
  if (labelLower.includes('home') || labelLower.includes('homepage')) return 'house';
  if (labelLower.includes('work') || labelLower.includes('business')) return 'building';
  return 'link';
}

export function getDisplayLabel(url: string, label: string | null): string {
  if (label) return label;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'Link';
  }
}

export function getRelationshipIcon(relationship: string | null): string {
  const r = (relationship || '').toLowerCase();
  if (r.includes('spouse') || r.includes('partner') || r.includes('husband') || r.includes('wife')) return 'heart';
  if (r.includes('child') || r.includes('son') || r.includes('daughter')) return 'child';
  if (r.includes('parent') || r.includes('mother') || r.includes('father')) return 'people-roof';
  if (r.includes('sibling') || r.includes('brother') || r.includes('sister')) return 'users';
  if (r.includes('friend')) return 'user';
  if (r.includes('assistant') || r.includes('manager')) return 'id-badge';
  return 'user';
}
