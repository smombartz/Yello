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
  if (p.includes('linkedin')) return 'briefcase';
  if (p.includes('twitter') || p.includes('x')) return 'hashtag';
  if (p.includes('facebook')) return 'users';
  if (p.includes('instagram')) return 'camera';
  if (p.includes('github')) return 'code';
  return 'link';
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
