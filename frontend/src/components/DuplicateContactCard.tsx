import { Avatar } from './Avatar';
import type { ContactDetail, ContactAddress, ContactSocialProfile, DeduplicationMode } from '../api/types';
import { getCountryFlag, getCountryName } from '../lib/phoneUtils';

interface DuplicateContactCardProps {
  contact: ContactDetail;
  matchingField: DeduplicationMode;
  matchingValue: string;
  matchedCriteria?: string[];  // For recommended mode - which field types matched
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
  matchedCriteria = [],
}: DuplicateContactCardProps) {
  // Extract field types from matchedCriteria (format: "email:value", "phone:value", "name")
  const matchedFieldTypes = new Set(
    matchedCriteria.map(c => c.includes(':') ? c.split(':')[0] : c)
  );

  // For recommended mode: check if a field type is in matchedCriteria
  const isFieldTypeMatching = (fieldType: string): boolean => {
    return matchedFieldTypes.has(fieldType);
  };

  // Check if name matched (for showing nickname indicator)
  const nameMatched = matchedFieldTypes.has('name');
  return (
    <div className="duplicate-card">
      <div className="duplicate-card-header">
        <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={40} />
        <div className="duplicate-card-name">
          <span className={`name ${nameMatched ? 'matching' : ''}`}>
            {contact.displayName}
            {nameMatched && <span className="name-match-indicator" title="Name/nickname match"> (similar name)</span>}
          </span>
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
          </div>
        ))}

        {/* Phone mode: show all phones */}
        {matchingField === 'phone' && contact.phones.map((phone, idx) => {
          const flag = getCountryFlag(phone.countryCode);
          const countryName = getCountryName(phone.countryCode);
          return (
            <div
              key={idx}
              className={`duplicate-card-field ${isMatchingPhone(phone.phone, matchingValue) ? 'matching' : ''}`}
            >
              <span className="material-symbols-outlined">phone</span>
              <span className="value phone-display">
                {flag && <span className="phone-flag" title={countryName}>{flag}</span>}
                <span>{phone.phoneDisplay}</span>
              </span>
            </div>
          );
        })}

        {/* Address mode: show all addresses */}
        {matchingField === 'address' && contact.addresses.map((addr, idx) => (
          <div
            key={idx}
            className={`duplicate-card-field ${isMatchingAddressSingle(addr, matchingValue) ? 'matching' : ''}`}
          >
            <span className="material-symbols-outlined">location_on</span>
            <span className="value">{formatSingleAddress(addr)}</span>
          </div>
        ))}

        {/* Social Links mode: show all social profiles */}
        {matchingField === 'social-links' && contact.socialProfiles.map((social, idx) => (
          <div
            key={idx}
            className={`duplicate-card-field ${isMatchingSocialSingle(social, matchingValue) ? 'matching' : ''}`}
          >
            <span className="material-symbols-outlined">share</span>
            <span className="value">{social.platform}: @{social.username}</span>
          </div>
        ))}

        {/* Recommended mode: show all relevant fields with matched criteria highlighting */}
        {matchingField === 'recommended' && (
          <>
            {/* Emails - highlight all if 'email' is in matchedCriteria */}
            {contact.emails.map((email, idx) => (
              <div
                key={`email-${idx}`}
                className={`duplicate-card-field ${isFieldTypeMatching('email') ? 'matching' : ''}`}
              >
                <span className="material-symbols-outlined">mail</span>
                <span className="value">{email.email}</span>
              </div>
            ))}

            {/* Phones - highlight all if 'phone' is in matchedCriteria */}
            {contact.phones.map((phone, idx) => {
              const flag = getCountryFlag(phone.countryCode);
              const countryName = getCountryName(phone.countryCode);
              return (
                <div
                  key={`phone-${idx}`}
                  className={`duplicate-card-field ${isFieldTypeMatching('phone') ? 'matching' : ''}`}
                >
                  <span className="material-symbols-outlined">phone</span>
                  <span className="value phone-display">
                    {flag && <span className="phone-flag" title={countryName}>{flag}</span>}
                    <span>{phone.phoneDisplay}</span>
                  </span>
                </div>
              );
            })}

            {/* Social profiles - highlight all if 'social' is in matchedCriteria */}
            {contact.socialProfiles.map((social, idx) => (
              <div
                key={`social-${idx}`}
                className={`duplicate-card-field ${isFieldTypeMatching('social') ? 'matching' : ''}`}
              >
                <span className="material-symbols-outlined">share</span>
                <span className="value">{social.platform}: @{social.username}</span>
              </div>
            ))}

            {/* Empty state for recommended mode */}
            {contact.emails.length === 0 && contact.phones.length === 0 && contact.socialProfiles.length === 0 && (
              <div className="duplicate-card-field empty">
                <span className="value">No contact info</span>
              </div>
            )}
          </>
        )}

        {/* Show empty state if current mode has no items */}
        {((matchingField === 'email' && contact.emails.length === 0) ||
          (matchingField === 'phone' && contact.phones.length === 0) ||
          (matchingField === 'address' && contact.addresses.length === 0) ||
          (matchingField === 'social-links' && contact.socialProfiles.length === 0)) && (
          <div className="duplicate-card-field empty">
            <span className="value">No {matchingField} info</span>
          </div>
        )}
      </div>
    </div>
  );
}
