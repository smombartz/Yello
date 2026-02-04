import type { ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson } from '../api/types';
import { getCountryFlag, getCountryName } from '../lib/phoneUtils';

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
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  );
}

export function formatBirthday(dateString: string): string {
  // Handle various date formats (YYYY-MM-DD, YYYYMMDD, etc.)
  const cleaned = dateString.replace(/[^0-9-]/g, '');
  try {
    // Try parsing as ISO date
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
  } catch {
    // Fall through
  }
  return dateString;
}

export function getPlatformIcon(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes('linkedin')) return 'work';
  if (p.includes('twitter') || p.includes('x')) return 'tag';
  if (p.includes('facebook')) return 'group';
  if (p.includes('instagram')) return 'photo_camera';
  if (p.includes('github')) return 'code';
  return 'link';
}

export function getServiceIcon(service: string): string {
  const s = service.toLowerCase();
  if (s.includes('aim')) return 'chat';
  if (s.includes('facebook') || s.includes('messenger')) return 'forum';
  if (s.includes('jabber') || s.includes('xmpp')) return 'chat_bubble';
  if (s.includes('skype')) return 'video_call';
  if (s.includes('icq')) return 'chat';
  return 'message';
}

export function getUrlIcon(url: string, label: string | null): string {
  const urlLower = url.toLowerCase();
  const labelLower = (label || '').toLowerCase();

  if (urlLower.includes('linkedin') || labelLower.includes('linkedin')) return 'work';
  if (urlLower.includes('whatsapp') || labelLower.includes('whatsapp')) return 'chat';
  if (urlLower.includes('twitter') || urlLower.includes('x.com') || labelLower.includes('twitter')) return 'tag';
  if (urlLower.includes('facebook') || labelLower.includes('facebook')) return 'group';
  if (urlLower.includes('instagram') || labelLower.includes('instagram')) return 'photo_camera';
  if (urlLower.includes('github') || labelLower.includes('github')) return 'code';
  if (labelLower.includes('home') || labelLower.includes('homepage')) return 'home';
  if (labelLower.includes('work') || labelLower.includes('business')) return 'business';
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
  if (r.includes('spouse') || r.includes('partner') || r.includes('husband') || r.includes('wife')) return 'favorite';
  if (r.includes('child') || r.includes('son') || r.includes('daughter')) return 'child_care';
  if (r.includes('parent') || r.includes('mother') || r.includes('father')) return 'family_restroom';
  if (r.includes('sibling') || r.includes('brother') || r.includes('sister')) return 'group';
  if (r.includes('friend')) return 'person';
  if (r.includes('assistant') || r.includes('manager')) return 'badge';
  return 'person';
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
              <span className="material-symbols-outlined">call</span>
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
            <span className="material-symbols-outlined">add</span>
            Add Phone
          </button>

          {emails.map((email, i) => (
            <EditableArrayItem key={`email-${i}`} onRemove={() => removeEmail(i)}>
              <span className="material-symbols-outlined">mail</span>
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
            <span className="material-symbols-outlined">add</span>
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
              <span className="material-symbols-outlined">call</span>
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
            <span className="material-symbols-outlined">mail</span>
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
              <span className="material-symbols-outlined">location_on</span>
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
            <span className="material-symbols-outlined">add</span>
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
          const parts = [addr.street, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean);
          if (!parts.length) return null;

          const icon = addr.type?.toLowerCase() === 'home' ? 'home' :
                       addr.type?.toLowerCase() === 'work' ? 'business' : 'location_on';

          return (
            <div key={i} className="expanded-item">
              <span className="material-symbols-outlined">{icon}</span>
              <div className="expanded-item-content">
                <span className="address-text">{parts.join(', ')}</span>
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
              <span className="material-symbols-outlined">{getPlatformIcon(profile.platform)}</span>
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
            <span className="material-symbols-outlined">add</span>
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
            <span className="material-symbols-outlined">{getPlatformIcon(profile.platform)}</span>
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

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Birthday</h4>
        <div className="section-content edit-section-content">
          <div className="expanded-item">
            <span className="material-symbols-outlined">cake</span>
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
          <span className="material-symbols-outlined">cake</span>
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
            <span className="material-symbols-outlined">add</span>
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
              <span className="material-symbols-outlined">{getServiceIcon(im.service)}</span>
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
            <span className="material-symbols-outlined">add</span>
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
            <span className="material-symbols-outlined">{getServiceIcon(im.service)}</span>
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
              <span className="material-symbols-outlined">{getUrlIcon(u.url, u.label)}</span>
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
            <span className="material-symbols-outlined">add</span>
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
            <span className="material-symbols-outlined">{getUrlIcon(u.url, u.label)}</span>
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
              <span className="material-symbols-outlined">{getRelationshipIcon(person.relationship)}</span>
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
            <span className="material-symbols-outlined">add</span>
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
            <span className="material-symbols-outlined">{getRelationshipIcon(person.relationship)}</span>
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
