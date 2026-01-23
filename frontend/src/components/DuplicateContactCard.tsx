import { Avatar } from './Avatar';
import type { ContactDetail, ContactAddress, ContactSocialProfile, DeduplicationMode } from '../api/types';

interface DuplicateContactCardProps {
  contact: ContactDetail;
  matchingField: DeduplicationMode;
  matchingValue: string;
}

function formatSingleAddress(addr: ContactAddress): string {
  const parts = [addr.street, addr.city, addr.state, addr.postalCode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'No address';
}

function isMatchingEmail(email: string, matchingValue: string): boolean {
  return email.toLowerCase() === matchingValue.toLowerCase();
}

function isMatchingPhone(phone: string, matchingValue: string): boolean {
  return phone === matchingValue;
}

function isMatchingAddressSingle(addr: ContactAddress, matchingValue: string): boolean {
  const [street, city, postalCode] = matchingValue.split('|');
  return (
    (addr.street?.toLowerCase() ?? '') === street &&
    (addr.city?.toLowerCase() ?? '') === city &&
    (addr.postalCode?.toLowerCase() ?? '') === postalCode
  );
}

function isMatchingSocialSingle(social: ContactSocialProfile, matchingValue: string): boolean {
  const [platform, username] = matchingValue.split(':');
  return social.platform === platform && social.username === username;
}

export function DuplicateContactCard({
  contact,
  matchingField,
  matchingValue,
}: DuplicateContactCardProps) {
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
        {/* Email mode: show all emails */}
        {matchingField === 'email' && contact.emails.map((email, idx) => (
          <div
            key={idx}
            className={`duplicate-card-field ${isMatchingEmail(email.email, matchingValue) ? 'matching' : ''}`}
          >
            <span className="material-symbols-outlined">mail</span>
            <span className="value">{email.email}</span>
            {email.type && <span className="type">{email.type}</span>}
          </div>
        ))}

        {/* Phone mode: show all phones */}
        {matchingField === 'phone' && contact.phones.map((phone, idx) => (
          <div
            key={idx}
            className={`duplicate-card-field ${isMatchingPhone(phone.phone, matchingValue) ? 'matching' : ''}`}
          >
            <span className="material-symbols-outlined">phone</span>
            <span className="value">{phone.phoneDisplay}</span>
            {phone.type && <span className="type">{phone.type}</span>}
          </div>
        ))}

        {/* Address mode: show all addresses */}
        {matchingField === 'address' && contact.addresses.map((addr, idx) => (
          <div
            key={idx}
            className={`duplicate-card-field ${isMatchingAddressSingle(addr, matchingValue) ? 'matching' : ''}`}
          >
            <span className="material-symbols-outlined">location_on</span>
            <span className="value">{formatSingleAddress(addr)}</span>
            {addr.type && <span className="type">{addr.type}</span>}
          </div>
        ))}

        {/* Social mode: show all social profiles */}
        {matchingField === 'social' && contact.socialProfiles.map((social, idx) => (
          <div
            key={idx}
            className={`duplicate-card-field ${isMatchingSocialSingle(social, matchingValue) ? 'matching' : ''}`}
          >
            <span className="material-symbols-outlined">share</span>
            <span className="value">{social.platform}: @{social.username}</span>
            {social.type && <span className="type">{social.type}</span>}
          </div>
        ))}

        {/* Show empty state if current mode has no items */}
        {((matchingField === 'email' && contact.emails.length === 0) ||
          (matchingField === 'phone' && contact.phones.length === 0) ||
          (matchingField === 'address' && contact.addresses.length === 0) ||
          (matchingField === 'social' && contact.socialProfiles.length === 0)) && (
          <div className="duplicate-card-field empty">
            <span className="value">No {matchingField} info</span>
          </div>
        )}
      </div>
    </div>
  );
}
