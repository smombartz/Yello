import type { ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson, LinkedInEnrichment } from '../api/types';
import { getCountryFlag, getCountryName } from '../lib/phoneUtils';
import { formatAddress } from '../lib/addressUtils';
import { Icon } from './Icon';
import {
  formatBirthday,
  getZodiacSign,
  getPlatformIcon,
  getServiceIcon,
  getUrlIcon,
  getDisplayLabel,
  getRelationshipIcon
} from '../utils/contactFormatters';

// Editable input component for simple text fields
export function EditableField({
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="edit-input"
    />
  );
}

// Editable array item with remove button
export function EditableArrayItem({
  children,
  onRemove
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <div className="editable-array-item">
      {children}
      <button type="button" className="remove-item-btn" onClick={onRemove} title="Remove">
        <Icon name="xmark" />
      </button>
    </div>
  );
}

export function ContactInfoSection({ emails, phones, isEditMode, onEmailsChange, onPhonesChange }: {
  emails: ContactEmail[];
  phones: ContactPhone[];
  isEditMode: boolean;
  onEmailsChange?: (emails: ContactEmail[]) => void;
  onPhonesChange?: (phones: ContactPhone[]) => void;
}) {
  if (!isEditMode && !emails.length && !phones.length) return null;

  const addEmail = () => {
    if (onEmailsChange) {
      onEmailsChange([...emails, { email: '', type: null, isPrimary: emails.length === 0 }]);
    }
  };

  const addPhone = () => {
    if (onPhonesChange) {
      onPhonesChange([...phones, { phone: '', phoneDisplay: '', countryCode: null, type: null, isPrimary: phones.length === 0 }]);
    }
  };

  const updateEmail = (index: number, field: keyof ContactEmail, value: string | boolean) => {
    if (onEmailsChange) {
      const updated = [...emails];
      updated[index] = { ...updated[index], [field]: value };
      onEmailsChange(updated);
    }
  };

  const removeEmail = (index: number) => {
    if (onEmailsChange) {
      onEmailsChange(emails.filter((_, i) => i !== index));
    }
  };

  const updatePhone = (index: number, field: keyof ContactPhone, value: string | boolean) => {
    if (onPhonesChange) {
      const updated = [...phones];
      updated[index] = { ...updated[index], [field]: value };
      // Keep phoneDisplay in sync with phone for editing
      if (field === 'phone') {
        updated[index].phoneDisplay = value as string;
      }
      onPhonesChange(updated);
    }
  };

  const removePhone = (index: number) => {
    if (onPhonesChange) {
      onPhonesChange(phones.filter((_, i) => i !== index));
    }
  };

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Contact Info</h4>
        <div className="section-content edit-section-content">
          {phones.map((phone, i) => (
            <EditableArrayItem key={`phone-${i}`} onRemove={() => removePhone(i)}>
              <Icon name="phone" />
              <div className="edit-field-group">
                <EditableField
                  value={phone.phoneDisplay}
                  onChange={(v) => updatePhone(i, 'phone', v)}
                  placeholder="Phone number"
                />
                <EditableField
                  value={phone.type || ''}
                  onChange={(v) => updatePhone(i, 'type', v)}
                  placeholder="Type (home, work...)"
                />
              </div>
            </EditableArrayItem>
          ))}
          <button type="button" className="add-item-btn" onClick={addPhone}>
            <Icon name="plus" />
            Add Phone
          </button>

          {emails.map((email, i) => (
            <EditableArrayItem key={`email-${i}`} onRemove={() => removeEmail(i)}>
              <Icon name="envelope" />
              <div className="edit-field-group">
                <EditableField
                  value={email.email}
                  onChange={(v) => updateEmail(i, 'email', v)}
                  placeholder="Email address"
                  type="email"
                />
                <EditableField
                  value={email.type || ''}
                  onChange={(v) => updateEmail(i, 'type', v)}
                  placeholder="Type (home, work...)"
                />
              </div>
            </EditableArrayItem>
          ))}
          <button type="button" className="add-item-btn" onClick={addEmail}>
            <Icon name="plus" />
            Add Email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section">
      <h4 className="section-header">Contact Info</h4>
      <div className="section-content">
        {phones.map((phone, i) => {
          const flag = getCountryFlag(phone.countryCode);
          const countryName = getCountryName(phone.countryCode);
          return (
            <div key={`phone-${i}`} className="expanded-item">
              <Icon name="phone" />
              <div className="expanded-item-content">
                <a href={`tel:${phone.phone}`} className="phone-display">
                  {flag && <span className="phone-flag" title={countryName}>{flag}</span>}
                  <span>{phone.phoneDisplay}</span>
                </a>
                {phone.type && <span className="item-type">{phone.type}</span>}
              </div>
            </div>
          );
        })}
        {emails.map((email, i) => (
          <div key={`email-${i}`} className="expanded-item">
            <Icon name="envelope" />
            <div className="expanded-item-content">
              <a href={`mailto:${email.email}`}>{email.email}</a>
              {email.type && <span className="item-type">{email.type}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LocationsSection({ addresses, isEditMode, onAddressesChange }: {
  addresses: ContactAddress[];
  isEditMode: boolean;
  onAddressesChange?: (addresses: ContactAddress[]) => void;
}) {
  if (!isEditMode && !addresses.length) return null;

  const addAddress = () => {
    if (onAddressesChange) {
      onAddressesChange([...addresses, { street: null, city: null, state: null, postalCode: null, country: null, type: null }]);
    }
  };

  const updateAddress = (index: number, field: keyof ContactAddress, value: string | null) => {
    if (onAddressesChange) {
      const updated = [...addresses];
      updated[index] = { ...updated[index], [field]: value || null };
      onAddressesChange(updated);
    }
  };

  const removeAddress = (index: number) => {
    if (onAddressesChange) {
      onAddressesChange(addresses.filter((_, i) => i !== index));
    }
  };

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Locations</h4>
        <div className="section-content edit-section-content">
          {addresses.map((addr, i) => (
            <EditableArrayItem key={i} onRemove={() => removeAddress(i)}>
              <Icon name="location-dot" />
              <div className="edit-field-group address-fields">
                <EditableField
                  value={addr.street || ''}
                  onChange={(v) => updateAddress(i, 'street', v)}
                  placeholder="Street"
                />
                <div className="address-row">
                  <EditableField
                    value={addr.city || ''}
                    onChange={(v) => updateAddress(i, 'city', v)}
                    placeholder="City"
                  />
                  <EditableField
                    value={addr.state || ''}
                    onChange={(v) => updateAddress(i, 'state', v)}
                    placeholder="State"
                  />
                </div>
                <div className="address-row">
                  <EditableField
                    value={addr.postalCode || ''}
                    onChange={(v) => updateAddress(i, 'postalCode', v)}
                    placeholder="Postal Code"
                  />
                  <EditableField
                    value={addr.country || ''}
                    onChange={(v) => updateAddress(i, 'country', v)}
                    placeholder="Country"
                  />
                </div>
                <EditableField
                  value={addr.type || ''}
                  onChange={(v) => updateAddress(i, 'type', v)}
                  placeholder="Type (home, work...)"
                />
              </div>
            </EditableArrayItem>
          ))}
          <button type="button" className="add-item-btn" onClick={addAddress}>
            <Icon name="plus" />
            Add Address
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section">
      <h4 className="section-header">Locations</h4>
      <div className="section-content">
        {addresses.map((addr, i) => {
          const formatted = formatAddress(addr);
          if (formatted === '(Empty address)') return null;

          const icon = addr.type?.toLowerCase() === 'home' ? 'house' :
                       addr.type?.toLowerCase() === 'work' ? 'building' : 'location-dot';

          return (
            <div key={i} className="expanded-item">
              <Icon name={icon} />
              <div className="expanded-item-content">
                <span className="address-text">{formatted}</span>
                {addr.type && <span className="item-type">{addr.type}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SocialLinksSection({ socialProfiles, isEditMode, onSocialProfilesChange }: {
  socialProfiles: ContactSocialProfile[];
  isEditMode: boolean;
  onSocialProfilesChange?: (profiles: ContactSocialProfile[]) => void;
}) {
  if (!isEditMode && !socialProfiles.length) return null;

  const addProfile = () => {
    if (onSocialProfilesChange) {
      onSocialProfilesChange([...socialProfiles, { id: 0, contactId: 0, platform: '', username: '', profileUrl: null, type: null }]);
    }
  };

  const updateProfile = (index: number, field: keyof ContactSocialProfile, value: string | null) => {
    if (onSocialProfilesChange) {
      const updated = [...socialProfiles];
      updated[index] = { ...updated[index], [field]: value };
      onSocialProfilesChange(updated);
    }
  };

  const removeProfile = (index: number) => {
    if (onSocialProfilesChange) {
      onSocialProfilesChange(socialProfiles.filter((_, i) => i !== index));
    }
  };

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Social & Links</h4>
        <div className="section-content edit-section-content">
          {socialProfiles.map((profile, i) => (
            <EditableArrayItem key={i} onRemove={() => removeProfile(i)}>
              <Icon name={getPlatformIcon(profile.platform)} />
              <div className="edit-field-group">
                <EditableField
                  value={profile.platform}
                  onChange={(v) => updateProfile(i, 'platform', v)}
                  placeholder="Platform (LinkedIn, Twitter...)"
                />
                <EditableField
                  value={profile.username}
                  onChange={(v) => updateProfile(i, 'username', v)}
                  placeholder="Username"
                />
                <EditableField
                  value={profile.profileUrl || ''}
                  onChange={(v) => updateProfile(i, 'profileUrl', v)}
                  placeholder="Profile URL"
                />
              </div>
            </EditableArrayItem>
          ))}
          <button type="button" className="add-item-btn" onClick={addProfile}>
            <Icon name="plus" />
            Add Social Profile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section">
      <h4 className="section-header">Social & Links</h4>
      <div className="section-content">
        {socialProfiles.map((profile) => (
          <div key={profile.id} className="expanded-item">
            <Icon name={getPlatformIcon(profile.platform)} />
            <div className="expanded-item-content">
              {profile.profileUrl ? (
                <a href={profile.profileUrl} target="_blank" rel="noopener noreferrer">
                  {profile.username || profile.platform}
                </a>
              ) : (
                <span>{profile.username}</span>
              )}
              <span className="item-type">{profile.platform}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BirthdaySection({ birthday, isEditMode, onBirthdayChange }: {
  birthday: string | null;
  isEditMode: boolean;
  onBirthdayChange?: (birthday: string | null) => void;
}) {
  if (!isEditMode && !birthday) return null;

  const zodiacSign = birthday ? getZodiacSign(birthday) : null;

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Birthday</h4>
        <div className="section-content edit-section-content">
          <div className="expanded-item">
            <Icon name="cake-candles" />
            <div className="edit-field-group">
              <EditableField
                value={birthday || ''}
                onChange={(v) => onBirthdayChange?.(v || null)}
                placeholder="YYYY-MM-DD"
                type="date"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section">
      <h4 className="section-header">Birthday</h4>
      <div className="section-content">
        <div className="expanded-item">
          {zodiacSign ? (
            <img
              src={`/zodiac/${zodiacSign}.svg`}
              alt={zodiacSign}
              className="zodiac-icon"
              title={zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1)}
            />
          ) : (
            <Icon name="cake-candles" />
          )}
          <div className="expanded-item-content">
            <span>{formatBirthday(birthday!)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CategoriesSection({ categories, isEditMode, onCategoriesChange }: {
  categories: ContactCategory[];
  isEditMode: boolean;
  onCategoriesChange?: (categories: ContactCategory[]) => void;
}) {
  if (!isEditMode && !categories.length) return null;

  const addCategory = () => {
    if (onCategoriesChange) {
      onCategoriesChange([...categories, { id: 0, contactId: 0, category: '' }]);
    }
  };

  const updateCategory = (index: number, value: string) => {
    if (onCategoriesChange) {
      const updated = [...categories];
      updated[index] = { ...updated[index], category: value };
      onCategoriesChange(updated);
    }
  };

  const removeCategory = (index: number) => {
    if (onCategoriesChange) {
      onCategoriesChange(categories.filter((_, i) => i !== index));
    }
  };

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Categories</h4>
        <div className="section-content edit-section-content">
          {categories.map((cat, i) => (
            <EditableArrayItem key={i} onRemove={() => removeCategory(i)}>
              <EditableField
                value={cat.category}
                onChange={(v) => updateCategory(i, v)}
                placeholder="Category name"
              />
            </EditableArrayItem>
          ))}
          <button type="button" className="add-item-btn" onClick={addCategory}>
            <Icon name="plus" />
            Add Category
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section">
      <h4 className="section-header">Categories</h4>
      <div className="section-content">
        <div className="expanded-item categories-container">
          {categories.map((cat) => (
            <span key={cat.id} className="category-tag">
              {cat.category}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InstantMessagesSection({ instantMessages, isEditMode, onInstantMessagesChange }: {
  instantMessages: ContactInstantMessage[];
  isEditMode: boolean;
  onInstantMessagesChange?: (messages: ContactInstantMessage[]) => void;
}) {
  if (!isEditMode && !instantMessages.length) return null;

  const addIM = () => {
    if (onInstantMessagesChange) {
      onInstantMessagesChange([...instantMessages, { id: 0, contactId: 0, service: '', handle: '', type: null }]);
    }
  };

  const updateIM = (index: number, field: keyof ContactInstantMessage, value: string | null) => {
    if (onInstantMessagesChange) {
      const updated = [...instantMessages];
      updated[index] = { ...updated[index], [field]: value };
      onInstantMessagesChange(updated);
    }
  };

  const removeIM = (index: number) => {
    if (onInstantMessagesChange) {
      onInstantMessagesChange(instantMessages.filter((_, i) => i !== index));
    }
  };

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Instant Messages</h4>
        <div className="section-content edit-section-content">
          {instantMessages.map((im, i) => (
            <EditableArrayItem key={i} onRemove={() => removeIM(i)}>
              <Icon name={getServiceIcon(im.service)} />
              <div className="edit-field-group">
                <EditableField
                  value={im.service}
                  onChange={(v) => updateIM(i, 'service', v)}
                  placeholder="Service (Skype, AIM...)"
                />
                <EditableField
                  value={im.handle}
                  onChange={(v) => updateIM(i, 'handle', v)}
                  placeholder="Handle"
                />
              </div>
            </EditableArrayItem>
          ))}
          <button type="button" className="add-item-btn" onClick={addIM}>
            <Icon name="plus" />
            Add Instant Message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section">
      <h4 className="section-header">Instant Messages</h4>
      <div className="section-content">
        {instantMessages.map((im) => (
          <div key={im.id} className="expanded-item">
            <Icon name={getServiceIcon(im.service)} />
            <div className="expanded-item-content">
              <span>{im.handle}</span>
              <span className="item-type">{im.service}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UrlsSection({ urls, isEditMode, onUrlsChange }: {
  urls: ContactUrl[];
  isEditMode: boolean;
  onUrlsChange?: (urls: ContactUrl[]) => void;
}) {
  if (!isEditMode && !urls.length) return null;

  const addUrl = () => {
    if (onUrlsChange) {
      onUrlsChange([...urls, { id: 0, contactId: 0, url: '', label: null, type: null }]);
    }
  };

  const updateUrl = (index: number, field: keyof ContactUrl, value: string | null) => {
    if (onUrlsChange) {
      const updated = [...urls];
      updated[index] = { ...updated[index], [field]: value };
      onUrlsChange(updated);
    }
  };

  const removeUrl = (index: number) => {
    if (onUrlsChange) {
      onUrlsChange(urls.filter((_, i) => i !== index));
    }
  };

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Links</h4>
        <div className="section-content edit-section-content">
          {urls.map((u, i) => (
            <EditableArrayItem key={i} onRemove={() => removeUrl(i)}>
              <Icon name={getUrlIcon(u.url, u.label)} />
              <div className="edit-field-group">
                <EditableField
                  value={u.url}
                  onChange={(v) => updateUrl(i, 'url', v)}
                  placeholder="URL"
                />
                <EditableField
                  value={u.label || ''}
                  onChange={(v) => updateUrl(i, 'label', v || null)}
                  placeholder="Label"
                />
              </div>
            </EditableArrayItem>
          ))}
          <button type="button" className="add-item-btn" onClick={addUrl}>
            <Icon name="plus" />
            Add Link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section">
      <h4 className="section-header">Links</h4>
      <div className="section-content">
        {urls.map((u) => (
          <div key={u.id} className="expanded-item">
            <Icon name={getUrlIcon(u.url, u.label)} />
            <div className="expanded-item-content">
              <a href={u.url} target="_blank" rel="noopener noreferrer">
                {getDisplayLabel(u.url, u.label)}
              </a>
              {u.label && <span className="item-type">{u.label}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RelatedPeopleSection({ relatedPeople, isEditMode, onRelatedPeopleChange }: {
  relatedPeople: ContactRelatedPerson[];
  isEditMode: boolean;
  onRelatedPeopleChange?: (people: ContactRelatedPerson[]) => void;
}) {
  if (!isEditMode && !relatedPeople.length) return null;

  const addPerson = () => {
    if (onRelatedPeopleChange) {
      onRelatedPeopleChange([...relatedPeople, { id: 0, contactId: 0, name: '', relationship: null }]);
    }
  };

  const updatePerson = (index: number, field: keyof ContactRelatedPerson, value: string | null) => {
    if (onRelatedPeopleChange) {
      const updated = [...relatedPeople];
      updated[index] = { ...updated[index], [field]: value };
      onRelatedPeopleChange(updated);
    }
  };

  const removePerson = (index: number) => {
    if (onRelatedPeopleChange) {
      onRelatedPeopleChange(relatedPeople.filter((_, i) => i !== index));
    }
  };

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Related People</h4>
        <div className="section-content edit-section-content">
          {relatedPeople.map((person, i) => (
            <EditableArrayItem key={i} onRemove={() => removePerson(i)}>
              <Icon name={getRelationshipIcon(person.relationship)} />
              <div className="edit-field-group">
                <EditableField
                  value={person.name}
                  onChange={(v) => updatePerson(i, 'name', v)}
                  placeholder="Name"
                />
                <EditableField
                  value={person.relationship || ''}
                  onChange={(v) => updatePerson(i, 'relationship', v || null)}
                  placeholder="Relationship"
                />
              </div>
            </EditableArrayItem>
          ))}
          <button type="button" className="add-item-btn" onClick={addPerson}>
            <Icon name="plus" />
            Add Related Person
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section">
      <h4 className="section-header">Related People</h4>
      <div className="section-content">
        {relatedPeople.map((person) => (
          <div key={person.id} className="expanded-item">
            <Icon name={getRelationshipIcon(person.relationship)} />
            <div className="expanded-item-content">
              <span>{person.name}</span>
              {person.relationship && <span className="item-type">{person.relationship}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NotesSection({ notes, isEditMode, onNotesChange }: {
  notes: string | null;
  isEditMode: boolean;
  onNotesChange?: (notes: string | null) => void;
}) {
  if (!isEditMode && !notes) return null;

  if (isEditMode) {
    return (
      <div className="notes-box edit-notes-box">
        <textarea
          value={notes || ''}
          onChange={(e) => onNotesChange?.(e.target.value || null)}
          placeholder="Add notes..."
          className="edit-notes-textarea"
          rows={4}
        />
      </div>
    );
  }

  return (
    <div className="notes-box">
      <div className="notes-content">{notes}</div>
    </div>
  );
}

// LinkedIn Section (read-only, displays enrichment data)
export function LinkedInSection({ enrichment, contactPhotoUrl }: { enrichment: LinkedInEnrichment; contactPhotoUrl?: string | null }) {
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Show LinkedIn photo if available and different from contact's existing photo
  const showLinkedInPhoto = enrichment.photoLinkedin && enrichment.photoLinkedin !== contactPhotoUrl;

  return (
    <div className="expanded-section linkedin-section">
      <h4 className="section-header">
        <svg className="linkedin-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
        LinkedIn
      </h4>
      <div className="section-content linkedin-content">
        {/* Profile photo from LinkedIn */}
        {showLinkedInPhoto && (
          <div className="linkedin-profile-photo">
            <img
              src={enrichment.photoLinkedin!}
              alt="LinkedIn profile"
              className="linkedin-avatar"
              onError={(e) => {
                // Hide image on error (expired URL, etc.)
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Headline - prominently displayed */}
        {enrichment.headline && (
          <div className="linkedin-headline">{enrichment.headline}</div>
        )}

        {/* Job + Company */}
        {(enrichment.jobTitle || enrichment.companyName) && (
          <div className="expanded-item">
            <Icon name="briefcase" />
            <div className="expanded-item-content">
              <span>
                {enrichment.jobTitle}
                {enrichment.jobTitle && enrichment.companyName && ' at '}
                {enrichment.companyLinkedinUrl ? (
                  <a href={enrichment.companyLinkedinUrl} target="_blank" rel="noopener noreferrer">
                    {enrichment.companyName}
                  </a>
                ) : (
                  enrichment.companyName
                )}
              </span>
            </div>
          </div>
        )}

        {/* Industry + Location */}
        {(enrichment.industry || enrichment.location) && (
          <div className="expanded-item">
            <Icon name="location-dot" />
            <div className="expanded-item-content">
              <span>
                {[enrichment.location, enrichment.industry].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
        )}

        {/* About - collapsible if long */}
        {enrichment.about && (
          <div className="linkedin-about">
            <details>
              <summary>About</summary>
              <p>{enrichment.about}</p>
            </details>
          </div>
        )}

        {/* Skills as tags */}
        {enrichment.skills && enrichment.skills.length > 0 && (
          <div className="linkedin-skills">
            <div className="expanded-item">
              <Icon name="badge-check" />
              <div className="expanded-item-content skills-list">
                {enrichment.skills.map((skill, i) => (
                  <span key={i} className="skill-tag">{skill}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Education */}
        {enrichment.education && enrichment.education.length > 0 && (
          <div className="expanded-item">
            <Icon name="graduation-cap" />
            <div className="expanded-item-content">
              <ul className="education-list">
                {enrichment.education.map((edu, i) => (
                  <li key={i}>{edu}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Followers count */}
        {enrichment.followersCount !== null && enrichment.followersCount > 0 && (
          <div className="expanded-item">
            <Icon name="users" />
            <div className="expanded-item-content">
              <span>{enrichment.followersCount.toLocaleString()} followers</span>
            </div>
          </div>
        )}

        {/* Enriched date footer */}
        <div className="linkedin-footer">
          <Icon name="clock-rotate-left" />
          <span>Enriched from LinkedIn {formatDate(enrichment.enrichedAt)}</span>
        </div>
      </div>
    </div>
  );
}

// Edit form state interface (for use by both ContactRowExpanded and AddContactPage)
export interface EditFormState {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  notes: string | null;
  birthday: string | null;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  socialProfiles: ContactSocialProfile[];
  categories: ContactCategory[];
  instantMessages: ContactInstantMessage[];
  urls: ContactUrl[];
  relatedPeople: ContactRelatedPerson[];
}
