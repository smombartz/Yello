/**
 * The facts the Terms and Privacy Policy depend on, in one place for review
 * with counsel. A value still in [square brackets] is a placeholder: it renders
 * highlighted on the page so it cannot ship unnoticed. See docs/legal-review.md.
 */
export const LEGAL = {
  /** The legal entity that operates Yello and is party to the Terms. */
  entityName: 'Office for Visual Affairs',
  /** Registered or postal address for legal notices. */
  entityAddress: '19 Morris Ave, Brooklyn, NY 11205',
  /** Where privacy requests and legal notices go. */
  contactEmail: 'frontdesk@officeforvisualaffairs.com',
  /** The law that governs the Terms, and where disputes are heard. */
  governingLaw: 'the laws of the State of New York',
  venue:
    'the state courts located in Kings County, New York, or the United States District Court for the Eastern District of New York',
  /** Where Railway runs Yello's servers and stores its data (Railway region us-west2). */
  hostingRegion: 'the United States',
  /** How long Railway keeps server logs. Estimate: Railway keeps 7 to 30 days depending on plan. */
  logRetention: 'up to 30 days',
  /** How soon an account is deleted after a deletion request. Estimate. */
  deletionDays: '30',
  /** Notice before the Service shuts down (Terms, Ending your use). Estimate. */
  shutdownNoticeDays: '30',
  /** Notice before a significant change to the Terms takes effect. Estimate. */
  termsNoticeDays: '14',
  /** Liability cap when nothing has been paid (Terms, Limitation of liability). Estimate. */
  liabilityCap: 'US$100',
  /** Minimum age to hold an account. */
  minimumAge: 16,
  /** Shown at the top of both pages. Update whenever a change is published. The effective
   *  date is an estimate: set it to the day the pages go live. */
  effectiveDate: 'November 1, 2026',
  lastUpdated: 'October 25, 2026',
} as const;

/** True for a value that still needs filling in before launch. */
export function isPlaceholder(value: string | number): boolean {
  return typeof value === 'string' && value.startsWith('[');
}
