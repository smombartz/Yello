import { describe, it, expect } from 'vitest';
import { suggestKind, type KindCandidate } from '../contactKindSuggestions.js';

const contact = (over: Partial<KindCandidate>): KindCandidate => ({
  firstName: null,
  lastName: null,
  displayName: over.displayName ?? [over.firstName, over.lastName].filter(Boolean).join(' '),
  company: null,
  emails: [],
  ...over,
});

describe('suggestKind', () => {
  it.each([
    ['legal form in a nameless contact', contact({ displayName: 'Acme GmbH', company: 'Acme GmbH' }), 'company', 'strong'],
    ['legal form split into first/last name', contact({ firstName: 'Acme', lastName: 'Inc.' }), 'company', 'strong'],
    ['short legal form in capitals as the last word', contact({ firstName: 'Siemens', lastName: 'AG' }), 'company', 'strong'],
    ['role words', contact({ displayName: 'Front Desk – Hilton' }), 'generic', 'strong'],
    ['possessive place', contact({ firstName: "Mom's", lastName: 'work' }), 'generic', 'strong'],
    ['curly apostrophe', contact({ displayName: 'Dan’s office' }), 'generic', 'strong'],
    ['business word', contact({ firstName: 'Blue', lastName: 'Bottle Cafe' }), 'company', 'likely'],
    ['accented business word', contact({ displayName: 'Le Petit Café' }), 'company', 'likely'],
    ['trade', contact({ firstName: 'Joe', lastName: 'Plumber' }), 'generic', 'likely'],
    ['role email, no name', contact({ displayName: 'noreply@shop.com', emails: ['noreply@shop.com'] }), 'generic', 'strong'],
    ['company email, no name', contact({ displayName: 'info@acme.com', emails: ['Info@acme.com'] }), 'company', 'likely'],
    ['only a company name', contact({ displayName: 'Initech', company: 'Initech' }), 'company', 'strong'],
  ])('%s', (_label, input, kind, confidence) => {
    expect(suggestKind(input)).toMatchObject({ kind, confidence });
  });

  it.each([
    ['a person with a company', contact({ firstName: 'Ada', lastName: 'Lovelace', company: 'Acme Inc' })],
    ['a short legal form that is a surname', contact({ firstName: 'Sabine', lastName: 'Ag' })],
    ['a keyword inside a longer word', contact({ firstName: 'Barbara', lastName: 'Cabot' })],
    ['a role email on a named contact', contact({ firstName: 'Sam', lastName: 'Lee', emails: ['support@acme.com'] })],
    ['a nameless contact with no company', contact({ displayName: 'No Name' })],
  ])('no suggestion for %s', (_label, input) => {
    expect(suggestKind(input)).toBeNull();
  });

  it('gives a readable reason', () => {
    expect(suggestKind(contact({ displayName: 'Acme GmbH', company: 'Acme GmbH' }))?.reasons[0]).toBe('Name has "GmbH"');
  });
});
