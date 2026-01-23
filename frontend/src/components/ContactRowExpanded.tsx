import type { ContactDetail, ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile } from '../api/types';

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

      {/* Main content grid */}
      <div className="expanded-grid">
        {/* Left column: Contact Info */}
        <div className="expanded-column">
          {hasContactInfo && (
            <ContactInfoSection emails={contact.emails} phones={contact.phones} />
          )}
        </div>

        {/* Center column: Locations */}
        <div className="expanded-column">
          {hasLocations && (
            <LocationsSection addresses={contact.addresses} />
          )}
        </div>

        {/* Right column: Social + Metadata */}
        <div className="expanded-column">
          {hasSocial && (
            <SocialLinksSection socialProfiles={contact.socialProfiles} />
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
