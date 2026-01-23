import type { ContactDetail, ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson } from '../api/types';

interface ContactRowExpandedProps {
  contact: ContactDetail;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function ContactInfoSection({ emails, phones }: { emails: ContactEmail[]; phones: ContactPhone[] }) {
  if (!emails.length && !phones.length) return null;

  return (
    <div className="expanded-section">
      <h4 className="section-header">Contact Info</h4>
      <div className="section-content">
        {phones.map((phone, i) => (
          <div key={`phone-${i}`} className="expanded-item">
            <span className="material-symbols-outlined">call</span>
            <div className="expanded-item-content">
              <a href={`tel:${phone.phone}`}>{phone.phoneDisplay}</a>
              {phone.type && <span className="item-type">{phone.type}</span>}
            </div>
          </div>
        ))}
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

function LocationsSection({ addresses }: { addresses: ContactAddress[] }) {
  if (!addresses.length) return null;

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

function SocialLinksSection({ socialProfiles }: { socialProfiles: ContactSocialProfile[] }) {
  if (!socialProfiles.length) return null;

  const getPlatformIcon = (platform: string): string => {
    const p = platform.toLowerCase();
    if (p.includes('linkedin')) return 'work';
    if (p.includes('twitter') || p.includes('x')) return 'tag';
    if (p.includes('facebook')) return 'group';
    if (p.includes('instagram')) return 'photo_camera';
    if (p.includes('github')) return 'code';
    return 'link';
  };

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

function formatBirthday(dateString: string): string {
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

function BirthdaySection({ birthday }: { birthday: string }) {
  if (!birthday) return null;

  return (
    <div className="expanded-section">
      <h4 className="section-header">Birthday</h4>
      <div className="section-content">
        <div className="expanded-item">
          <span className="material-symbols-outlined">cake</span>
          <div className="expanded-item-content">
            <span>{formatBirthday(birthday)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoriesSection({ categories }: { categories: ContactCategory[] }) {
  if (!categories.length) return null;

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

function InstantMessagesSection({ instantMessages }: { instantMessages: ContactInstantMessage[] }) {
  if (!instantMessages.length) return null;

  const getServiceIcon = (service: string): string => {
    const s = service.toLowerCase();
    if (s.includes('aim')) return 'chat';
    if (s.includes('facebook') || s.includes('messenger')) return 'forum';
    if (s.includes('jabber') || s.includes('xmpp')) return 'chat_bubble';
    if (s.includes('skype')) return 'video_call';
    if (s.includes('icq')) return 'chat';
    return 'message';
  };

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

function UrlsSection({ urls }: { urls: ContactUrl[] }) {
  if (!urls.length) return null;

  const getUrlIcon = (url: string, label: string | null): string => {
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
  };

  const getDisplayLabel = (url: string, label: string | null): string => {
    if (label) return label;
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'Link';
    }
  };

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

function RelatedPeopleSection({ relatedPeople }: { relatedPeople: ContactRelatedPerson[] }) {
  if (!relatedPeople.length) return null;

  const getRelationshipIcon = (relationship: string | null): string => {
    const r = (relationship || '').toLowerCase();
    if (r.includes('spouse') || r.includes('partner') || r.includes('husband') || r.includes('wife')) return 'favorite';
    if (r.includes('child') || r.includes('son') || r.includes('daughter')) return 'child_care';
    if (r.includes('parent') || r.includes('mother') || r.includes('father')) return 'family_restroom';
    if (r.includes('sibling') || r.includes('brother') || r.includes('sister')) return 'group';
    if (r.includes('friend')) return 'person';
    if (r.includes('assistant') || r.includes('manager')) return 'badge';
    return 'person';
  };

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

function MetadataSection({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) {
  return (
    <div className="expanded-section metadata-section">
      <div className="metadata-item">
        <span className="metadata-label">Created</span>
        <span className="metadata-value">{formatDate(createdAt)}</span>
      </div>
      <div className="metadata-item">
        <span className="metadata-label">Updated</span>
        <span className="metadata-value">{formatDate(updatedAt)}</span>
      </div>
    </div>
  );
}

function NotesSection({ notes }: { notes: string }) {
  if (!notes) return null;

  return (
    <div className="notes-box">
      <div className="notes-content">{notes}</div>
    </div>
  );
}

export function ContactRowExpanded({ contact }: ContactRowExpandedProps) {
  const hasContactInfo = contact.emails.length > 0 || contact.phones.length > 0;
  const hasLocations = contact.addresses.length > 0;
  const hasSocial = contact.socialProfiles.length > 0;
  const hasCategories = contact.categories?.length > 0;
  const hasInstantMessages = contact.instantMessages?.length > 0;
  const hasUrls = contact.urls?.length > 0;
  const hasRelatedPeople = contact.relatedPeople?.length > 0;
  const hasBirthday = !!contact.birthday;

  return (
    <div className="expanded-content" onClick={(e) => e.stopPropagation()}>
      {/* Title + Quick Actions row */}
      <div className="expanded-top-row">
        {contact.title && <p className="expanded-title">{contact.title}</p>}
        <div className="expanded-actions">
          {contact.emails.length > 0 && (
            <a href={`mailto:${contact.emails[0].email}`} className="action-button">
              <span className="material-symbols-outlined">mail</span>
              Email
            </a>
          )}
          {contact.phones.length > 0 && (
            <a href={`tel:${contact.phones[0].phone}`} className="action-button">
              <span className="material-symbols-outlined">call</span>
              Call
            </a>
          )}
        </div>
      </div>

      {/* Categories row */}
      {hasCategories && (
        <CategoriesSection categories={contact.categories} />
      )}

      {/* Main content grid */}
      <div className="expanded-grid">
        {/* Left column: Contact Info + Instant Messages */}
        <div className="expanded-column">
          {hasContactInfo && (
            <ContactInfoSection emails={contact.emails} phones={contact.phones} />
          )}
          {hasInstantMessages && (
            <InstantMessagesSection instantMessages={contact.instantMessages} />
          )}
        </div>

        {/* Center column: Locations + Birthday + Related People */}
        <div className="expanded-column">
          {hasLocations && (
            <LocationsSection addresses={contact.addresses} />
          )}
          {hasBirthday && (
            <BirthdaySection birthday={contact.birthday!} />
          )}
          {hasRelatedPeople && (
            <RelatedPeopleSection relatedPeople={contact.relatedPeople} />
          )}
        </div>

        {/* Right column: Social + URLs + Metadata */}
        <div className="expanded-column">
          {hasSocial && (
            <SocialLinksSection socialProfiles={contact.socialProfiles} />
          )}
          {hasUrls && (
            <UrlsSection urls={contact.urls} />
          )}
          <MetadataSection createdAt={contact.createdAt} updatedAt={contact.updatedAt} />
        </div>
      </div>

      {/* Notes section */}
      {contact.notes && (
        <div className="expanded-notes-row">
          <NotesSection notes={contact.notes} />
        </div>
      )}
    </div>
  );
}
