import { Avatar } from './Avatar';
import type { ContactDetail, DeduplicationMode } from '../api/types';

interface DuplicateContactCardProps {
  contact: ContactDetail;
  matchingField: DeduplicationMode;
  matchingValue: string;
}

function formatAddress(contact: ContactDetail): string | null {
  const addr = contact.addresses[0];
  if (!addr) return null;
  const parts = [addr.street, addr.city, addr.state, addr.postalCode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function isMatchingEmail(email: string, matchingValue: string): boolean {
  return email.toLowerCase() === matchingValue.toLowerCase();
}

function isMatchingPhone(phone: string, matchingValue: string): boolean {
  return phone === matchingValue;
}

function isMatchingAddress(contact: ContactDetail, matchingValue: string): boolean {
  const [street, city, postalCode] = matchingValue.split('|');
  return contact.addresses.some(
    (a) =>
      (a.street?.toLowerCase() ?? '') === street &&
      (a.city?.toLowerCase() ?? '') === city &&
      (a.postalCode?.toLowerCase() ?? '') === postalCode
  );
}

function isMatchingSocial(contact: ContactDetail, matchingValue: string): boolean {
  const [platform, username] = matchingValue.split(':');
  return contact.socialProfiles.some(
    (s) => s.platform === platform && s.username === username
  );
}

export function DuplicateContactCard({
  contact,
  matchingField,
  matchingValue,
}: DuplicateContactCardProps) {
  const primaryEmail = contact.emails.find((e) => e.isPrimary)?.email ?? contact.emails[0]?.email;
  const primaryPhone =
    contact.phones.find((p) => p.isPrimary)?.phoneDisplay ?? contact.phones[0]?.phoneDisplay;
  const address = formatAddress(contact);
  const socialProfile = contact.socialProfiles[0];

  return (
    <div className="duplicate-card">
      <div className="duplicate-card-header">
        <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={40} />
        <div className="duplicate-card-name">
          <span className="name">{contact.displayName}</span>
          {contact.company && <span className="company">{contact.company}</span>}
        </div>
      </div>

      <div className="duplicate-card-fields">
        {primaryEmail && (
          <div
            className={`duplicate-card-field ${
              matchingField === 'email' && isMatchingEmail(primaryEmail, matchingValue)
                ? 'matching'
                : ''
            }`}
          >
            <span className="material-symbols-outlined">mail</span>
            <span className="value">{primaryEmail}</span>
          </div>
        )}

        {primaryPhone && (
          <div
            className={`duplicate-card-field ${
              matchingField === 'phone' &&
              contact.phones.some((p) => isMatchingPhone(p.phone, matchingValue))
                ? 'matching'
                : ''
            }`}
          >
            <span className="material-symbols-outlined">phone</span>
            <span className="value">{primaryPhone}</span>
          </div>
        )}

        {address && (
          <div
            className={`duplicate-card-field ${
              matchingField === 'address' && isMatchingAddress(contact, matchingValue)
                ? 'matching'
                : ''
            }`}
          >
            <span className="material-symbols-outlined">location_on</span>
            <span className="value">{address}</span>
          </div>
        )}

        {socialProfile && (
          <div
            className={`duplicate-card-field ${
              matchingField === 'social' && isMatchingSocial(contact, matchingValue)
                ? 'matching'
                : ''
            }`}
          >
            <span className="material-symbols-outlined">share</span>
            <span className="value">
              {socialProfile.platform}: @{socialProfile.username}
            </span>
          </div>
        )}

        {!primaryEmail && !primaryPhone && !address && !socialProfile && (
          <div className="duplicate-card-field empty">
            <span className="value">No contact info</span>
          </div>
        )}
      </div>
    </div>
  );
}
