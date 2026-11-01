/**
 * Suggests contacts to mark as a company or generic, for Cleanup's
 * "Company or Generic" tab. Plain keyword rules on the contact's name and
 * email, so every suggestion carries a reason the user can check.
 *
 * Only the name is searched for keywords, never the company field: "Ada
 * Lovelace" at "Acme Inc" is a person. A contact with no first or last name
 * is known by its company, so its display name (usually the company) is searched.
 */

export type SuggestedKind = 'company' | 'generic';
export type Confidence = 'strong' | 'likely';

export interface KindSuggestion {
  kind: SuggestedKind;
  confidence: Confidence;
  reasons: string[];
}

export interface KindCandidate {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  company: string | null;
  emails: string[];
}

interface Signal extends KindSuggestion {
  reasons: [string];
}

/** Lowercase, accents folded, curly apostrophes straightened. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase();
}

/** Words of a name; dots are dropped so "S.A." and "Inc." match "sa" and "inc". */
function words(text: string): string[] {
  return fold(text).replace(/\./g, '').split(/[^a-z0-9&']+/).map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean);
}

const list = (labels: string[]) => new Map(labels.map(label => [words(label).join(' '), label]));

/** Legal forms that can appear anywhere in a name. */
const LEGAL_FORMS = list([
  'Inc', 'LLC', 'Ltd', 'Limited', 'GmbH', 'Corp', 'Corporation', 'PLC', 'LLP', 'Pty',
  'SAS', 'SARL', 'S.r.l.', 'S.p.A.', '& Co'
]);

/** Short legal forms, counted only as the last word and written in capitals or with dots ("Siemens AG", not "Sabine Ag"). */
const SHORT_LEGAL_FORMS = /(?:^|\s)(AG|SA|S\.A\.|AB|AS|BV|B\.V\.|NV|N\.V\.|UG|KG|Co\.)$/;

const ROLE_WORDS = list([
  'Reception', 'Front Desk', 'Support', 'Help Desk', 'Helpdesk', 'Hotline', 'Customer Service',
  'Service Desk', 'Emergency', 'Voicemail', 'Switchboard', 'Main Line', 'Dispatch', 'Concierge',
  'Doorman', 'Lobby', 'Security', 'After Hours', 'Appointments', 'Booking', 'Bookings',
  'Reservations', 'Taxi', 'Cab', 'Delivery'
]);

/** "Mom's work", "Dan's office". */
const POSSESSIVE_PLACE = /\b[a-z]+'s (work|office|house|home|place|job)\b/;

const BUSINESS_WORDS = list([
  'Restaurant', 'Cafe', 'Bistro', 'Bar', 'Bakery', 'Hotel', 'Bank', 'Studio', 'Agency', 'Gallery',
  'Clinic', 'Dental', 'Salon', 'Shop', 'Store', 'Group', 'Partners', 'Associates', 'Consulting',
  'Solutions', 'Services', 'Foundation', 'Institute', 'University', 'College', 'School', 'Museum',
  'Pharmacy', 'Garage', 'Airlines', 'Insurance', 'Realty', 'Labs', 'Media', 'Architects', 'Club',
  'Center', 'Centre'
]);

const TRADE_WORDS = list([
  'Plumber', 'Electrician', 'Locksmith', 'Dentist', 'Vet', 'Mechanic', 'Babysitter', 'Landlord',
  'Handyman', 'Cleaner'
]);

const GENERIC_EMAILS = new Set([
  'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply', 'notifications', 'notification',
  'alerts', 'support', 'help', 'helpdesk', 'admin', 'webmaster', 'postmaster', 'mailer-daemon'
]);

const COMPANY_EMAILS = new Set([
  'info', 'hello', 'contact', 'office', 'sales', 'team', 'enquiries', 'inquiries', 'orders',
  'billing', 'booking', 'bookings', 'reservations', 'mail'
]);

/** The first entry of `phrases` found in `tokens`, as its display label. */
function findPhrase(tokens: string[], phrases: Map<string, string>): string | null {
  const text = ` ${tokens.join(' ')} `;
  for (const [phrase, label] of phrases) {
    if (text.includes(` ${phrase} `)) return label;
  }
  return null;
}

const hasText = (value: string | null) => !!value?.trim();

/** A display name that is only a stand-in: an email, a phone number or "No Name". */
function isStandInName(name: string): boolean {
  return name.includes('@') || /^[\d\s+().-]+$/.test(name) || name.trim().toLowerCase() === 'no name';
}

export function suggestKind(contact: KindCandidate): KindSuggestion | null {
  const named = hasText(contact.firstName) || hasText(contact.lastName);
  const nameText = named
    ? [contact.firstName, contact.lastName].filter(hasText).join(' ')
    : isStandInName(contact.displayName) ? (contact.company ?? '') : contact.displayName;
  const tokens = words(nameText);
  const signals: Signal[] = [];

  const legal = findPhrase(tokens, LEGAL_FORMS) ?? nameText.trim().match(SHORT_LEGAL_FORMS)?.[1] ?? null;
  if (legal && tokens.length > 1) {
    signals.push({ kind: 'company', confidence: 'strong', reasons: [`Name has "${legal}"`] });
  }

  const role = findPhrase(tokens, ROLE_WORDS);
  if (role) signals.push({ kind: 'generic', confidence: 'strong', reasons: [`"${role}" in name`] });
  const place = fold(nameText).match(POSSESSIVE_PLACE);
  if (place) signals.push({ kind: 'generic', confidence: 'strong', reasons: [`Name is a place ("${place[0]}")`] });

  const business = findPhrase(tokens, BUSINESS_WORDS);
  if (business) signals.push({ kind: 'company', confidence: 'likely', reasons: [`"${business}" in name`] });

  const trade = findPhrase(tokens, TRADE_WORDS);
  if (trade) signals.push({ kind: 'generic', confidence: 'likely', reasons: [`Name is a trade ("${trade}")`] });

  if (!named) {
    for (const email of contact.emails) {
      const local = fold(email).split('@')[0];
      if (GENERIC_EMAILS.has(local)) {
        signals.push({ kind: 'generic', confidence: 'strong', reasons: [`Email starts with ${local}@`] });
      } else if (COMPANY_EMAILS.has(local)) {
        signals.push({ kind: 'company', confidence: 'likely', reasons: [`Email starts with ${local}@`] });
      }
    }
    if (hasText(contact.company)) {
      signals.push({ kind: 'company', confidence: 'strong', reasons: ['Only a company name, no person name'] });
    }
  }

  if (signals.length === 0) return null;
  // Rules are pushed in priority order: the first decides the kind
  const kind = signals[0].kind;
  const agreeing = signals.filter(s => s.kind === kind);
  return {
    kind,
    confidence: agreeing.some(s => s.confidence === 'strong') ? 'strong' : 'likely',
    reasons: [...new Set(agreeing.flatMap(s => s.reasons))].slice(0, 3)
  };
}
