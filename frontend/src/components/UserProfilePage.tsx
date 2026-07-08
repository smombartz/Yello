import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Icon } from './Icon';
import { ContactCardView } from './ContactCardView';
import type { ContactCardViewData, ContactCardEditState, SectionSuffixes } from './ContactCardView';
import type {
  ContactSocialProfile,
  ContactUrl,
  ContactPhone,
  ContactEmail,
  ContactAddress,
} from '../api/types';
import {
  useUserProfile,
  useUpdateUserProfile,
  useSearchContactsForLinking,
  useLinkProfileToContact,
  useUnlinkProfile,
  useCreateProfileContact,
} from '../api/profileHooks';
import { useAuth } from '../hooks/useAuth';
import type {
  UpdateUserProfileRequest,
  ProfileEmail,
  ProfilePhone,
  ProfileAddress,
  ProfileSocialLink,
  ProfileVisibility,
  ContactSearchResult,
} from '../api/types';
import { Avatar } from './Avatar';
import type { OutletContext } from './Layout';
import { EditableField } from './ContactFormSections';
import { formatBirthday } from '../utils/contactFormatters';

// Default visibility settings - all fields hidden by default for privacy
function getDefaultVisibility(): ProfileVisibility {
  return {
    avatar: false,
    firstName: false,
    lastName: false,
    tagline: false,
    company: false,
    title: false,
    emails: {},
    phones: {},
    addresses: {},
    website: false,
    linkedin: false,
    instagram: false,
    whatsapp: false,
    otherSocialLinks: {},
    birthday: false,
  };
}

// Initial form state
interface FormState {
  isPublic: boolean;
  publicSlug: string | null;
  avatarUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  tagline: string | null;
  company: string | null;
  title: string | null;
  emails: ProfileEmail[];
  phones: ProfilePhone[];
  addresses: ProfileAddress[];
  website: string | null;
  linkedin: string | null;
  instagram: string | null;
  whatsapp: string | null;
  otherSocialLinks: ProfileSocialLink[];
  birthday: string | null;
  notes: string | null;
  visibility: ProfileVisibility;
}

function getInitialFormState(): FormState {
  return {
    isPublic: false,
    publicSlug: null,
    avatarUrl: null,
    firstName: null,
    lastName: null,
    tagline: null,
    company: null,
    title: null,
    emails: [],
    phones: [],
    addresses: [],
    website: null,
    linkedin: null,
    instagram: null,
    whatsapp: null,
    otherSocialLinks: [],
    birthday: null,
    notes: null,
    visibility: getDefaultVisibility(),
  };
}

/** Map profile form state to ContactCardViewData for the shared card layout */
function mapProfileToCardData(form: FormState): ContactCardViewData {
  const socialProfiles: ContactSocialProfile[] = [];
  let socialId = 1;

  if (form.linkedin) {
    socialProfiles.push({
      id: socialId++, contactId: 0,
      platform: 'linkedin', username: form.linkedin,
      profileUrl: form.linkedin.startsWith('http') ? form.linkedin : `https://linkedin.com/in/${form.linkedin}`,
      type: null,
    });
  }
  if (form.instagram) {
    socialProfiles.push({
      id: socialId++, contactId: 0,
      platform: 'instagram', username: form.instagram,
      profileUrl: `https://instagram.com/${form.instagram}`,
      type: null,
    });
  }
  if (form.whatsapp) {
    socialProfiles.push({
      id: socialId++, contactId: 0,
      platform: 'whatsapp', username: form.whatsapp,
      profileUrl: `https://wa.me/${form.whatsapp.replace(/\D/g, '')}`,
      type: null,
    });
  }
  for (const link of form.otherSocialLinks) {
    if (link.platform.trim() && link.username.trim()) {
      socialProfiles.push({
        id: socialId++, contactId: 0,
        platform: link.platform, username: link.username,
        profileUrl: link.profileUrl,
        type: null,
      });
    }
  }

  const urls: ContactUrl[] = [];
  if (form.website) {
    urls.push({ id: 1, contactId: 0, url: form.website, label: 'Website', type: null });
  }

  return {
    phones: form.phones as ContactPhone[],
    emails: form.emails as ContactEmail[],
    addresses: form.addresses as ContactAddress[],
    socialProfiles,
    urls,
    birthday: form.birthday,
    notes: form.notes,
  };
}

// ─── Sentinel IDs for bidirectional mapping ───────────────────
// These negative IDs track which social profile / URL maps to which named field
const SENTINEL_LINKEDIN = -1;
const SENTINEL_INSTAGRAM = -2;
const SENTINEL_WHATSAPP = -3;
const SENTINEL_WEBSITE_URL = -200;
// otherSocialLinks use -100, -101, ...
function otherSocialSentinel(index: number) { return -(100 + index); }

/** Map form state → ContactCardEditState for edit mode */
function mapFormToEditState(form: FormState): ContactCardEditState {
  const socialProfiles: ContactSocialProfile[] = [];

  // Always include all 3 named slots (even if empty) so user can type into them
  socialProfiles.push({
    id: SENTINEL_LINKEDIN, contactId: 0,
    platform: 'linkedin', username: form.linkedin || '',
    profileUrl: form.linkedin
      ? (form.linkedin.startsWith('http') ? form.linkedin : `https://linkedin.com/in/${form.linkedin}`)
      : null,
    type: null,
  });
  socialProfiles.push({
    id: SENTINEL_INSTAGRAM, contactId: 0,
    platform: 'instagram', username: form.instagram || '',
    profileUrl: form.instagram ? `https://instagram.com/${form.instagram}` : null,
    type: null,
  });
  socialProfiles.push({
    id: SENTINEL_WHATSAPP, contactId: 0,
    platform: 'whatsapp', username: form.whatsapp || '',
    profileUrl: form.whatsapp ? `https://wa.me/${form.whatsapp.replace(/\D/g, '')}` : null,
    type: null,
  });

  // Other social links
  form.otherSocialLinks.forEach((link, i) => {
    socialProfiles.push({
      id: otherSocialSentinel(i), contactId: 0,
      platform: link.platform, username: link.username,
      profileUrl: link.profileUrl,
      type: null,
    });
  });

  const urls: ContactUrl[] = [];
  urls.push({
    id: SENTINEL_WEBSITE_URL, contactId: 0,
    url: form.website || '', label: 'Website', type: null,
  });

  return {
    phones: form.phones as ContactPhone[],
    emails: form.emails as ContactEmail[],
    addresses: form.addresses as ContactAddress[],
    socialProfiles,
    categories: [],
    instantMessages: [],
    urls,
    relatedPeople: [],
    birthday: form.birthday,
    notes: form.notes,
  };
}

/** Reverse map: editState change → form state updates */
function mapEditStateToForm(
  key: keyof ContactCardEditState,
  value: unknown,
  currentForm: FormState,
): Partial<FormState> {
  switch (key) {
    case 'phones':
      return { phones: value as ProfilePhone[] };
    case 'emails':
      return { emails: value as ProfileEmail[] };
    case 'addresses':
      return { addresses: value as ProfileAddress[] };
    case 'birthday':
      return { birthday: value as string | null };
    case 'notes':
      return { notes: value as string | null };

    case 'socialProfiles': {
      const profiles = value as ContactSocialProfile[];
      let linkedin = currentForm.linkedin;
      let instagram = currentForm.instagram;
      let whatsapp = currentForm.whatsapp;
      const otherSocialLinks: ProfileSocialLink[] = [];

      for (const p of profiles) {
        if (p.id === SENTINEL_LINKEDIN) {
          linkedin = p.username || null;
        } else if (p.id === SENTINEL_INSTAGRAM) {
          instagram = p.username || null;
        } else if (p.id === SENTINEL_WHATSAPP) {
          whatsapp = p.username || null;
        } else {
          // Other social links (sentinel IDs <= -100) or newly added (id=0)
          const existingIndex = p.id <= -100 ? -(p.id + 100) : -1;
          const existing = existingIndex >= 0 ? currentForm.otherSocialLinks[existingIndex] : undefined;
          otherSocialLinks.push({
            id: existing?.id,
            platform: p.platform,
            username: p.username,
            profileUrl: p.profileUrl,
          });
        }
      }
      return { linkedin, instagram, whatsapp, otherSocialLinks };
    }

    case 'urls': {
      const urlList = value as ContactUrl[];
      let website = currentForm.website;
      for (const u of urlList) {
        if (u.id === SENTINEL_WEBSITE_URL) {
          website = u.url || null;
        }
      }
      return { website };
    }

    default:
      return {};
  }
}

// Visibility toggle component
function VisibilityToggle({
  visible,
  onChange,
  disabled,
}: {
  visible: boolean;
  onChange: (visible: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`visibility-toggle ${visible ? 'visible' : 'hidden'} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onChange(!visible)}
      title={visible ? 'Visible on public card' : 'Hidden from public card'}
      disabled={disabled}
    >
      <Icon name={visible ? 'eye' : 'eye-slash'} />
    </button>
  );
}

// Public card preview component
function PublicCardPreview({ form, isPublic }: { form: FormState; isPublic: boolean }) {
  const visibility = form.visibility;

  if (!isPublic) {
    return (
      <div className="public-card-preview disabled">
        <div className="preview-disabled-message">
          <Icon name="eye-slash" />
          <p>Your public contact card is currently disabled.</p>
          <p>Enable it using the toggle above to see a preview.</p>
        </div>
      </div>
    );
  }

  const displayName = [
    visibility.firstName ? form.firstName : null,
    visibility.lastName ? form.lastName : null,
  ]
    .filter(Boolean)
    .join(' ') || 'Anonymous';

  const visibleEmails = form.emails.filter(
    (e) => visibility.emails[e.email] === true
  );
  const visiblePhones = form.phones.filter(
    (p) => visibility.phones[p.phone] === true
  );
  const visibleAddresses = form.addresses.filter(
    (a) => a.id && visibility.addresses[a.id] === true
  );

  return (
    <div className="public-card-preview">
      <div className="preview-card">
        {/* Avatar */}
        {visibility.avatar && form.avatarUrl && (
          <div className="preview-avatar">
            <Avatar photoUrl={form.avatarUrl} name={displayName} size={80} />
          </div>
        )}

        {/* Name and tagline */}
        <div className="preview-header">
          <h2 className="preview-name">{displayName}</h2>
          {visibility.tagline && form.tagline && (
            <p className="preview-tagline">{form.tagline}</p>
          )}
          {visibility.title && form.title && (
            <p className="preview-title">{form.title}</p>
          )}
          {visibility.company && form.company && (
            <p className="preview-company">{form.company}</p>
          )}
        </div>

        {/* Contact info */}
        <div className="preview-contact-info">
          {visibleEmails.map((email, i) => (
            <div key={`email-${i}`} className="preview-item">
              <Icon name="envelope" />
              <span>{email.email}</span>
            </div>
          ))}
          {visiblePhones.map((phone, i) => (
            <div key={`phone-${i}`} className="preview-item">
              <Icon name="phone" />
              <span>{phone.phoneDisplay}</span>
            </div>
          ))}
          {visibleAddresses.map((addr, i) => {
            const parts = [addr.street, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean);
            if (!parts.length) return null;
            return (
              <div key={`addr-${i}`} className="preview-item">
                <Icon name="location-dot" />
                <span>{parts.join(', ')}</span>
              </div>
            );
          })}
        </div>

        {/* Social links */}
        <div className="preview-social">
          {visibility.website && form.website && (
            <a href={form.website} target="_blank" rel="noopener noreferrer" className="preview-social-link">
              <Icon name="globe" />
            </a>
          )}
          {visibility.linkedin && form.linkedin && (
            <a href={form.linkedin} target="_blank" rel="noopener noreferrer" className="preview-social-link">
              <Icon name="linkedin" style="brands" />
            </a>
          )}
          {visibility.instagram && form.instagram && (
            <a href={`https://instagram.com/${form.instagram}`} target="_blank" rel="noopener noreferrer" className="preview-social-link">
              <Icon name="camera" />
            </a>
          )}
          {visibility.whatsapp && form.whatsapp && (
            <a href={`https://wa.me/${form.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="preview-social-link">
              <Icon name="whatsapp" style="brands" />
            </a>
          )}
        </div>

        {/* Birthday */}
        {visibility.birthday && form.birthday && (
          <div className="preview-birthday">
            <Icon name="cake-candles" />
            <span>{formatBirthday(form.birthday)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Contact search autocomplete component
function ContactSearchAutocomplete({
  onSelect,
  onCancel,
}: {
  onSelect: (contact: ContactSearchResult) => void;
  onCancel: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: searchResults, isLoading } = useSearchContactsForLinking(searchQuery);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="contact-search-autocomplete">
      <div className="search-input-wrapper">
        <Icon name="magnifying-glass" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your contacts..."
          className="search-input"
        />
        <button type="button" onClick={onCancel} className="cancel-btn">
          <Icon name="xmark" />
        </button>
      </div>

      <div className="search-results">
        {isLoading && searchQuery && (
          <div className="search-loading">Searching...</div>
        )}
        {searchResults && searchResults.length > 0 && (
          <ul className="results-list">
            {searchResults.map((contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  className="result-item"
                  onClick={() => onSelect(contact)}
                >
                  <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={40} />
                  <div className="result-info">
                    <strong>{contact.displayName}</strong>
                    <span className="result-detail">
                      {contact.primaryEmail || contact.primaryPhone || ''}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchResults && searchResults.length === 0 && searchQuery.length > 0 && (
          <div className="no-results">No contacts found</div>
        )}
      </div>
    </div>
  );
}

// Unlinked state - shows connect/create options
function UnlinkedProfileState({
  onConnect,
  onCreate,
  userName,
}: {
  onConnect: () => void;
  onCreate: (name: string) => void;
  userName: string | null;
}) {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newName, setNewName] = useState(userName || '');

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate(newName.trim());
    }
  };

  return (
    <div className="unlinked-profile-state">
      <div className="setup-icon">
        <Icon name="user-plus" />
      </div>
      <h2>Set Up Your Profile</h2>
      <p>Link your profile to a contact card to share your information publicly.</p>

      <div className="setup-options">
        <button type="button" className="setup-option" onClick={onConnect}>
          <div className="option-icon">
            <Icon name="link" />
          </div>
          <div className="option-content">
            <strong>Connect to Existing Contact</strong>
            <span>Search and link to a contact in your address book</span>
          </div>
        </button>

        {!showCreateInput ? (
          <button type="button" className="setup-option" onClick={() => setShowCreateInput(true)}>
            <div className="option-icon">
              <Icon name="circle-plus" />
            </div>
            <div className="option-content">
              <strong>Create New Profile</strong>
              <span>Create a new contact card linked to your profile</span>
            </div>
          </button>
        ) : (
          <div className="create-input-wrapper">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter your name"
              className="create-name-input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setShowCreateInput(false);
              }}
            />
            <div className="create-actions">
              <button type="button" className="secondary-button" onClick={() => setShowCreateInput(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleCreate}
                disabled={!newName.trim()}
              >
                Create Profile
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Linked profile header card
function LinkedProfileHeader({
  linkedContact,
  onUnlink,
}: {
  linkedContact: { id: number; displayName: string; photoUrl: string | null };
  onUnlink: () => void;
}) {
  const [showConfirmUnlink, setShowConfirmUnlink] = useState(false);

  return (
    <div className="linked-profile-header">
      <div className="header-content">
        <Avatar photoUrl={linkedContact.photoUrl} name={linkedContact.displayName} size={56} />
        <div className="header-info">
          <h3>{linkedContact.displayName}</h3>
          <p>Linked Contact</p>
        </div>
      </div>
      {!showConfirmUnlink ? (
        <button
          type="button"
          className="unlink-btn"
          onClick={() => setShowConfirmUnlink(true)}
        >
          <Icon name="link-slash" />
          Unlink
        </button>
      ) : (
        <div className="unlink-confirm">
          <p>Unlink this contact?</p>
          <div className="confirm-actions">
            <button type="button" className="secondary-button" onClick={() => setShowConfirmUnlink(false)}>
              Cancel
            </button>
            <button type="button" className="danger-button" onClick={onUnlink}>
              Unlink
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function UserProfilePage() {
  const { setHeaderConfig, isMobile } = useOutletContext<OutletContext>();
  const { user, logout, isLoggingOut } = useAuth();
  const { data: profile, isLoading } = useUserProfile();
  const updateProfileMutation = useUpdateUserProfile();
  const linkMutation = useLinkProfileToContact();
  const unlinkMutation = useUnlinkProfile();
  const createMutation = useCreateProfileContact();

  const [form, setForm] = useState<FormState>(getInitialFormState);
  const [hasChanges, setHasChanges] = useState(false);
  const [, setSaveSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConnectSearch, setShowConnectSearch] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    setHeaderConfig({
      title: 'Profile',
      actions: (
        <button
          type="button"
          className="logout-btn"
          onClick={logout}
          disabled={isLoggingOut}
        >
          <Icon name="right-from-bracket" />
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </button>
      ),
    });
  }, [setHeaderConfig, logout, isLoggingOut]);

  // Sync form when profile data loads from server
  // This is a legitimate pattern for syncing external (server) data to local form state
  useEffect(() => {
    if (profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        isPublic: profile.isPublic,
        publicSlug: profile.publicSlug,
        avatarUrl: profile.avatarUrl,
        firstName: profile.firstName,
        lastName: profile.lastName,
        tagline: profile.tagline,
        company: profile.company,
        title: profile.title,
        emails: profile.emails,
        phones: profile.phones,
        addresses: profile.addresses,
        website: profile.website,
        linkedin: profile.linkedin,
        instagram: profile.instagram,
        whatsapp: profile.whatsapp,
        otherSocialLinks: profile.otherSocialLinks,
        birthday: profile.birthday,
        notes: profile.notes,
        visibility: profile.visibility || getDefaultVisibility(),
      });
      setHasChanges(false);
    }
  }, [profile]);

  // Update form state helper
  const updateForm = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveSuccess(false);
  }, []);

  // Update visibility helper
  const updateVisibility = useCallback(<K extends keyof ProfileVisibility>(key: K, value: ProfileVisibility[K]) => {
    setForm((prev) => ({
      ...prev,
      visibility: { ...prev.visibility, [key]: value },
    }));
    setHasChanges(true);
    setSaveSuccess(false);
  }, []);

  // Hide all visibility fields
  const hideAllVisibility = useCallback(() => {
    const newVisibility: ProfileVisibility = {
      avatar: false,
      firstName: false,
      lastName: false,
      tagline: false,
      company: false,
      title: false,
      emails: Object.fromEntries(form.emails.map(e => [e.email, false])),
      phones: Object.fromEntries(form.phones.map(p => [p.phone, false])),
      addresses: Object.fromEntries(form.addresses.filter(a => a.id).map(a => [a.id!, false])),
      website: false,
      linkedin: false,
      instagram: false,
      whatsapp: false,
      otherSocialLinks: Object.fromEntries(form.otherSocialLinks.filter(l => l.id).map(l => [l.id!, false])),
      birthday: false,
    };
    updateForm('visibility', newVisibility);
  }, [form.emails, form.phones, form.addresses, form.otherSocialLinks, updateForm]);

  // Save handler
  const handleSave = async () => {
    setError(null);
    setSaveSuccess(false);

    const updateData: UpdateUserProfileRequest = {
      isPublic: form.isPublic,
      publicSlug: form.publicSlug,
      firstName: form.firstName,
      lastName: form.lastName,
      tagline: form.tagline,
      company: form.company,
      title: form.title,
      emails: form.emails.filter((e) => e.email.trim()),
      phones: form.phones.filter((p) => p.phone.trim()),
      addresses: form.addresses.filter(
        (a) => a.street || a.city || a.state || a.postalCode || a.country
      ),
      website: form.website,
      linkedin: form.linkedin,
      instagram: form.instagram,
      whatsapp: form.whatsapp,
      otherSocialLinks: form.otherSocialLinks.filter((s) => s.platform.trim() && s.username.trim()),
      birthday: form.birthday,
      notes: form.notes,
      visibility: form.visibility,
    };

    try {
      await updateProfileMutation.mutateAsync(updateData);
      setHasChanges(false);
      setSaveSuccess(true);
      setIsEditMode(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    }
  };

  // Cancel edit mode and reset form
  const handleCancelEdit = () => {
    setIsEditMode(false);
    if (profile) {
      setForm({
        isPublic: profile.isPublic,
        publicSlug: profile.publicSlug,
        avatarUrl: profile.avatarUrl,
        firstName: profile.firstName,
        lastName: profile.lastName,
        tagline: profile.tagline,
        company: profile.company,
        title: profile.title,
        emails: profile.emails,
        phones: profile.phones,
        addresses: profile.addresses,
        website: profile.website,
        linkedin: profile.linkedin,
        instagram: profile.instagram,
        whatsapp: profile.whatsapp,
        otherSocialLinks: profile.otherSocialLinks,
        birthday: profile.birthday,
        notes: profile.notes,
        visibility: profile.visibility || getDefaultVisibility(),
      });
      setHasChanges(false);
    }
  };

  // Copy URL handler
  const handleCopyUrl = async () => {
    if (profile?.publicUrl) {
      try {
        await navigator.clipboard.writeText(profile.publicUrl);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch {
        setError('Failed to copy URL');
      }
    }
  };

  // Link to contact handler
  const handleLinkContact = async (contact: ContactSearchResult) => {
    try {
      await linkMutation.mutateAsync(contact.id);
      setShowConnectSearch(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link contact');
    }
  };

  // Create new profile contact handler
  const handleCreateProfileContact = async (displayName: string) => {
    try {
      await createMutation.mutateAsync(displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile');
    }
  };

  // Unlink handler
  const handleUnlink = async () => {
    try {
      await unlinkMutation.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink contact');
    }
  };

  // Memoize edit state for ContactCardView
  const editState = useMemo<ContactCardEditState>(
    () => mapFormToEditState(form),
    [form]
  );

  // Build sectionSuffixes for visibility toggles
  const sectionSuffixes = useMemo<SectionSuffixes>(() => ({
    phones: (index: number) => {
      const phone = form.phones[index];
      if (!phone) return null;
      return (
        <VisibilityToggle
          visible={form.visibility.phones[phone.phone] === true}
          onChange={(v) => updateVisibility('phones', { ...form.visibility.phones, [phone.phone]: v })}
          disabled={!form.isPublic}
        />
      );
    },
    emails: (index: number) => {
      const email = form.emails[index];
      if (!email) return null;
      return (
        <VisibilityToggle
          visible={form.visibility.emails[email.email] === true}
          onChange={(v) => updateVisibility('emails', { ...form.visibility.emails, [email.email]: v })}
          disabled={!form.isPublic}
        />
      );
    },
    addresses: (index: number) => {
      const addr = form.addresses[index];
      if (!addr) return null;
      return (
        <VisibilityToggle
          visible={addr.id ? form.visibility.addresses[addr.id] === true : false}
          onChange={(v) => addr.id && updateVisibility('addresses', { ...form.visibility.addresses, [addr.id]: v })}
          disabled={!form.isPublic}
        />
      );
    },
    socialProfiles: (index: number) => {
      const profile = editState.socialProfiles[index];
      if (!profile) return null;
      // Map sentinel IDs back to visibility keys
      if (profile.id === SENTINEL_LINKEDIN) {
        return (
          <VisibilityToggle
            visible={form.visibility.linkedin}
            onChange={(v) => updateVisibility('linkedin', v)}
            disabled={!form.isPublic}
          />
        );
      }
      if (profile.id === SENTINEL_INSTAGRAM) {
        return (
          <VisibilityToggle
            visible={form.visibility.instagram}
            onChange={(v) => updateVisibility('instagram', v)}
            disabled={!form.isPublic}
          />
        );
      }
      if (profile.id === SENTINEL_WHATSAPP) {
        return (
          <VisibilityToggle
            visible={form.visibility.whatsapp}
            onChange={(v) => updateVisibility('whatsapp', v)}
            disabled={!form.isPublic}
          />
        );
      }
      // Other social links
      const otherIndex = -(profile.id + 100);
      const otherLink = otherIndex >= 0 ? form.otherSocialLinks[otherIndex] : undefined;
      if (otherLink?.id) {
        return (
          <VisibilityToggle
            visible={form.visibility.otherSocialLinks[otherLink.id] === true}
            onChange={(v) => updateVisibility('otherSocialLinks', { ...form.visibility.otherSocialLinks, [otherLink.id!]: v })}
            disabled={!form.isPublic}
          />
        );
      }
      return null;
    },
    urls: (index: number) => {
      const url = editState.urls[index];
      if (!url) return null;
      if (url.id === SENTINEL_WEBSITE_URL) {
        return (
          <VisibilityToggle
            visible={form.visibility.website}
            onChange={(v) => updateVisibility('website', v)}
            disabled={!form.isPublic}
          />
        );
      }
      return null;
    },
    birthday: () => (
      <VisibilityToggle
        visible={form.visibility.birthday}
        onChange={(v) => updateVisibility('birthday', v)}
        disabled={!form.isPublic}
      />
    ),
    // notes: no visibility toggle (always private)
  }), [form, editState.socialProfiles, editState.urls, updateVisibility]);

  const hiddenSections = useMemo(() => new Set(['categories', 'instantMessages', 'relatedPeople']), []);

  if (isLoading) {
    return (
      <div className="profile-loading">
        <div className="loading-spinner" />
        <p>Loading profile...</p>
      </div>
    );
  }

  // Show connect search overlay
  if (showConnectSearch) {
    return (
      <>
        <div className="page-content">
          <ContactSearchAutocomplete
            onSelect={handleLinkContact}
            onCancel={() => setShowConnectSearch(false)}
          />
        </div>
      </>
    );
  }

  // Show unlinked state if no linked contact
  if (!profile?.linkedContactId) {
    return (
      <>
        <div className="page-content">
          {error && (
            <div className="edit-error">
              <Icon name="circle-exclamation" />
              {error}
            </div>
          )}
          <UnlinkedProfileState
            onConnect={() => setShowConnectSearch(true)}
            onCreate={handleCreateProfileContact}
            userName={user?.name || null}
          />
        </div>
      </>
    );
  }

  // Linked state - show profile with view/edit modes
  return (
    <>
      <div className="page-content">
        <div className="profile-page-layout">
          {/* Section 1: Public settings — 2-col grid (controls + preview) */}
          <div className="profile-public-settings">
            <div className="public-settings-controls">
              {/* Error message */}
              {error && (
                <div className="edit-error">
                  <Icon name="circle-exclamation" />
                  {error}
                </div>
              )}

              {/* Linked contact header */}
              {profile.linkedContact && (
                <LinkedProfileHeader
                  linkedContact={profile.linkedContact}
                  onUnlink={handleUnlink}
                />
              )}

              {/* Public card controls */}
              <div className="profile-section public-card-controls">
                <div className="public-toggle-row">
                  <div className="public-toggle-label">
                    <Icon name="globe" />
                    <div>
                      <strong>Make my contact card public</strong>
                      <p>Share your contact info with a public link</p>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={form.isPublic}
                      onChange={(e) => updateForm('isPublic', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {form.isPublic && (
                  <button
                    type="button"
                    className="hide-all-btn"
                    onClick={hideAllVisibility}
                  >
                    <Icon name="eye-slash" />
                    Hide All Fields
                  </button>
                )}

                {form.isPublic && profile?.publicUrl && (
                  <div className="public-url-row">
                    <div className="public-url-display">
                      <Icon name="link" />
                      <code>{profile.publicUrl}</code>
                    </div>
                    <div className="public-url-actions">
                      <a
                        href={`/p/${profile.publicSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="view-card-btn"
                        title="View public card"
                      >
                        <Icon name="arrow-up-right-from-square" />
                      </a>
                      <button
                        type="button"
                        className="copy-url-btn"
                        onClick={handleCopyUrl}
                        title="Copy URL"
                      >
                        <Icon name={copySuccess ? 'check' : 'copy'} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Preview sidebar — only show in edit mode or when public */}
            {(isEditMode || form.isPublic) && (
              <div className="public-settings-preview">
                <div className="preview-panel-header">
                  <h3>Public Card Preview</h3>
                  <p>This is how others will see your contact card</p>
                </div>
                <PublicCardPreview form={form} isPublic={form.isPublic} />
              </div>
            )}
          </div>

          {/* Section 2: Contact details — full width */}
          <div className="profile-contact-details">
            {!isEditMode ? (
              <>
                <div className="contact-detail-content">
                  <ContactCardView data={mapProfileToCardData(form)} showMetadata={false} />
                </div>
                <div className="expanded-bottom-actions">
                  <button className="edit-button-primary" onClick={() => setIsEditMode(true)}>
                    <Icon name="pen-to-square" />
                    Edit Profile
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="expanded-top-row">
                  <div className="edit-name-fields profile-name-fields">
                    <div className="name-field-with-toggle">
                      <EditableField
                        value={form.firstName || ''}
                        onChange={(v) => { updateForm('firstName', v || null); }}
                        placeholder="First name"
                      />
                      <VisibilityToggle
                        visible={form.visibility.firstName}
                        onChange={(v) => updateVisibility('firstName', v)}
                        disabled={!form.isPublic}
                      />
                    </div>
                    <div className="name-field-with-toggle">
                      <EditableField
                        value={form.lastName || ''}
                        onChange={(v) => { updateForm('lastName', v || null); }}
                        placeholder="Last name"
                      />
                      <VisibilityToggle
                        visible={form.visibility.lastName}
                        onChange={(v) => updateVisibility('lastName', v)}
                        disabled={!form.isPublic}
                      />
                    </div>
                    <div className="name-field-with-toggle">
                      <EditableField
                        value={form.company || ''}
                        onChange={(v) => { updateForm('company', v || null); }}
                        placeholder="Company"
                      />
                      <VisibilityToggle
                        visible={form.visibility.company}
                        onChange={(v) => updateVisibility('company', v)}
                        disabled={!form.isPublic}
                      />
                    </div>
                    <div className="name-field-with-toggle">
                      <EditableField
                        value={form.title || ''}
                        onChange={(v) => { updateForm('title', v || null); }}
                        placeholder="Job title"
                      />
                      <VisibilityToggle
                        visible={form.visibility.title}
                        onChange={(v) => updateVisibility('title', v)}
                        disabled={!form.isPublic}
                      />
                    </div>
                    <div className="name-field-with-toggle">
                      <EditableField
                        value={form.tagline || ''}
                        onChange={(v) => { updateForm('tagline', v || null); }}
                        placeholder="Tagline"
                      />
                      <VisibilityToggle
                        visible={form.visibility.tagline}
                        onChange={(v) => updateVisibility('tagline', v)}
                        disabled={!form.isPublic}
                      />
                    </div>
                  </div>
                  <div className="expanded-actions">
                    <button
                      className="action-button secondary"
                      onClick={handleCancelEdit}
                      disabled={updateProfileMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      className="action-button primary"
                      onClick={handleSave}
                      disabled={updateProfileMutation.isPending}
                    >
                      {updateProfileMutation.isPending ? (
                        <>
                          <Icon name="arrows-rotate" className="spinning" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Icon name="floppy-disk" />
                          Save
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="edit-error">
                    <Icon name="circle-exclamation" />
                    {error}
                  </div>
                )}

                <ContactCardView
                  data={mapProfileToCardData(form)}
                  isEditMode={true}
                  editState={editState}
                  onEditStateChange={(key, value) => {
                    const updates = mapEditStateToForm(key, value, form);
                    setForm(prev => ({ ...prev, ...updates }));
                    setHasChanges(true);
                  }}
                  sectionSuffixes={sectionSuffixes}
                  hiddenSections={hiddenSections}
                  showMetadata={false}
                />
              </>
            )}
          </div>

          {/* Section 3: Account — full width */}
          <div className="profile-section account-section">
            <h3 className="section-title">Account</h3>
            <div className="account-info">
              {user?.email && (
                <p className="account-email">
                  <Icon name="envelope" />
                  Signed in as <strong>{user.email}</strong>
                </p>
              )}
              <button
                type="button"
                className="logout-button"
                onClick={logout}
                disabled={isLoggingOut}
              >
                <Icon name="right-from-bracket" />
                {isLoggingOut ? 'Signing out...' : 'Sign Out'}
              </button>
            </div>
          </div>

          {/* Mobile save button */}
          {isMobile && isEditMode && hasChanges && (
            <div className="mobile-save-bar">
              <button
                className="primary-button full-width"
                onClick={handleSave}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

    </>
  );
}

