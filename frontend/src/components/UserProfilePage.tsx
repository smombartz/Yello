import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Icon } from './Icon';
import { ContactCardView } from './ContactCardView';
import type { ContactCardViewData, SectionSuffixes } from './ContactCardView';
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
  UserProfile,
  UpdateUserProfileRequest,
  ProfileEmail,
  ProfilePhone,
  ProfileAddress,
  ProfileSocialLink,
  ProfileVisibility,
  ContactSearchResult,
} from '../api/types';
import { Avatar } from './Avatar';
import { SearchBar } from './ui/SearchBar';
import type { OutletContext } from './Layout';
import { formatBirthday } from '../utils/contactFormatters';

// Default visibility settings - name and avatar visible, everything else
// hidden for privacy (contact details are opt-in via the eye toggles)
function getDefaultVisibility(): ProfileVisibility {
  return {
    avatar: true,
    firstName: true,
    lastName: true,
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

// A profile whose visibility has never been configured (all flags false, as
// older profiles were created) — used to seed defaults when going public
function isVisibilityUnconfigured(v: ProfileVisibility): boolean {
  const boolFlags = [
    v.avatar, v.firstName, v.lastName, v.tagline, v.company, v.title,
    v.website, v.linkedin, v.instagram, v.whatsapp, v.birthday,
  ];
  const recordFlags = [v.emails, v.phones, v.addresses, v.otherSocialLinks]
    .flatMap((record) => Object.values(record));
  return !boolFlags.some(Boolean) && !recordFlags.some(Boolean);
}

function seedBasicVisibility(v: ProfileVisibility): ProfileVisibility {
  return { ...v, avatar: true, firstName: true, lastName: true };
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

// Map a server profile into form state (used on load, save, and cancel)
function profileToFormState(profile: UserProfile): FormState {
  return {
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
  };
}

// ─── Sentinel IDs ─────────────────────────────────────────────
// These negative IDs track which social profile / URL maps to which named
// field, so the visibility toggles can find the right flag per row
const SENTINEL_LINKEDIN = -1;
const SENTINEL_INSTAGRAM = -2;
const SENTINEL_WHATSAPP = -3;
const SENTINEL_WEBSITE_URL = -200;
// otherSocialLinks use -100, -101, ...
function otherSocialSentinel(index: number) { return -(100 + index); }

/** Map profile form state to ContactCardViewData for the shared card layout */
function mapProfileToCardData(form: FormState): ContactCardViewData {
  const socialProfiles: ContactSocialProfile[] = [];

  if (form.linkedin) {
    socialProfiles.push({
      id: SENTINEL_LINKEDIN, contactId: 0,
      platform: 'linkedin', username: form.linkedin,
      profileUrl: form.linkedin.startsWith('http') ? form.linkedin : `https://linkedin.com/in/${form.linkedin}`,
      type: null,
    });
  }
  if (form.instagram) {
    socialProfiles.push({
      id: SENTINEL_INSTAGRAM, contactId: 0,
      platform: 'instagram', username: form.instagram,
      profileUrl: `https://instagram.com/${form.instagram}`,
      type: null,
    });
  }
  if (form.whatsapp) {
    socialProfiles.push({
      id: SENTINEL_WHATSAPP, contactId: 0,
      platform: 'whatsapp', username: form.whatsapp,
      profileUrl: `https://wa.me/${form.whatsapp.replace(/\D/g, '')}`,
      type: null,
    });
  }
  form.otherSocialLinks.forEach((link, i) => {
    if (link.platform.trim() && link.username.trim()) {
      socialProfiles.push({
        id: otherSocialSentinel(i), contactId: 0,
        platform: link.platform, username: link.username,
        profileUrl: link.profileUrl,
        type: null,
      });
    }
  });

  const urls: ContactUrl[] = [];
  if (form.website) {
    urls.push({ id: SENTINEL_WEBSITE_URL, contactId: 0, url: form.website, label: 'Website', type: null });
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
      <SearchBar
        variant="plain"
        trailing="cancel"
        value={searchQuery}
        onChange={setSearchQuery}
        onCancel={onCancel}
        placeholder="Search your contacts..."
        inputRef={inputRef}
        autoFocus
      />

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
              <button type="button" className="profile-secondary-button" onClick={() => setShowCreateInput(false)}>
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
          <div className="profile-confirm-actions">
            <button type="button" className="profile-secondary-button" onClick={() => setShowConfirmUnlink(false)}>
              Cancel
            </button>
            <button type="button" className="profile-danger-button" onClick={onUnlink}>
              Unlink
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function UserProfilePage() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const { user, logout, isLoggingOut } = useAuth();
  const { data: profile, isLoading } = useUserProfile();
  const updateProfileMutation = useUpdateUserProfile();
  const linkMutation = useLinkProfileToContact();
  const unlinkMutation = useUnlinkProfile();
  const createMutation = useCreateProfileContact();

  const [form, setForm] = useState<FormState>(getInitialFormState);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConnectSearch, setShowConnectSearch] = useState(false);

  useEffect(() => {
    setHeaderConfig({
      title: 'Profile',
      actions: (
        <>
          {user?.email && (
            <span className="header-user-email">{user.email}</span>
          )}
          <button
            type="button"
            className="logout-btn"
            onClick={logout}
            disabled={isLoggingOut}
          >
            <Icon name="right-from-bracket" />
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </>
      ),
    });
  }, [setHeaderConfig, logout, isLoggingOut, user?.email]);

  // Sync form when profile data loads from server
  // This is a legitimate pattern for syncing external (server) data to local form state
  useEffect(() => {
    if (profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(profileToFormState(profile));
    }
  }, [profile]);

  // Autosave for the public settings (isPublic toggle, visibility toggles,
  // Hide All). Applies the change optimistically, persists via a partial PUT,
  // and reverts with an error banner if the save fails.
  const savePublicSettings = useCallback(async (partial: Pick<UpdateUserProfileRequest, 'isPublic' | 'visibility'>) => {
    const prev = { isPublic: form.isPublic, visibility: form.visibility };
    setError(null);
    setForm((f) => ({ ...f, ...partial }));
    try {
      await updateProfileMutation.mutateAsync(partial);
    } catch (err) {
      setForm((f) => ({ ...f, ...prev }));
      setError(err instanceof Error ? err.message : 'Failed to save public settings');
    }
  }, [form.isPublic, form.visibility, updateProfileMutation]);

  // Toggle a single visibility flag, autosaving immediately
  const updateVisibility = useCallback(<K extends keyof ProfileVisibility>(key: K, value: ProfileVisibility[K]) => {
    void savePublicSettings({ visibility: { ...form.visibility, [key]: value } });
  }, [form.visibility, savePublicSettings]);

  const handlePublicToggle = useCallback((checked: boolean) => {
    if (checked && isVisibilityUnconfigured(form.visibility)) {
      // First time going public: make name and avatar visible so the card
      // doesn't render as "Anonymous"
      void savePublicSettings({ isPublic: true, visibility: seedBasicVisibility(form.visibility) });
    } else {
      void savePublicSettings({ isPublic: checked });
    }
  }, [form.visibility, savePublicSettings]);

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
    void savePublicSettings({ visibility: newVisibility });
  }, [form.emails, form.phones, form.addresses, form.otherSocialLinks, savePublicSettings]);

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

  // Card data for the shared view layout
  const cardData = useMemo(() => mapProfileToCardData(form), [form]);

  // Toggles are disabled while the card is private or an autosave is in flight
  const togglesDisabled = !form.isPublic || updateProfileMutation.isPending;

  // Build sectionSuffixes for the per-field visibility toggles (autosaving)
  const sectionSuffixes = useMemo<SectionSuffixes>(() => ({
    phones: (index: number) => {
      const phone = form.phones[index];
      if (!phone) return null;
      return (
        <VisibilityToggle
          visible={form.visibility.phones[phone.phone] === true}
          onChange={(v) => updateVisibility('phones', { ...form.visibility.phones, [phone.phone]: v })}
          disabled={togglesDisabled}
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
          disabled={togglesDisabled}
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
          disabled={togglesDisabled}
        />
      );
    },
    socialProfiles: (index: number) => {
      const profile = cardData.socialProfiles[index];
      if (!profile) return null;
      // Map sentinel IDs back to visibility keys
      if (profile.id === SENTINEL_LINKEDIN) {
        return (
          <VisibilityToggle
            visible={form.visibility.linkedin}
            onChange={(v) => updateVisibility('linkedin', v)}
            disabled={togglesDisabled}
          />
        );
      }
      if (profile.id === SENTINEL_INSTAGRAM) {
        return (
          <VisibilityToggle
            visible={form.visibility.instagram}
            onChange={(v) => updateVisibility('instagram', v)}
            disabled={togglesDisabled}
          />
        );
      }
      if (profile.id === SENTINEL_WHATSAPP) {
        return (
          <VisibilityToggle
            visible={form.visibility.whatsapp}
            onChange={(v) => updateVisibility('whatsapp', v)}
            disabled={togglesDisabled}
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
            disabled={togglesDisabled}
          />
        );
      }
      return null;
    },
    urls: (index: number) => {
      const url = cardData.urls?.[index];
      if (!url) return null;
      if (url.id === SENTINEL_WEBSITE_URL) {
        return (
          <VisibilityToggle
            visible={form.visibility.website}
            onChange={(v) => updateVisibility('website', v)}
            disabled={togglesDisabled}
          />
        );
      }
      return null;
    },
    birthday: () => (
      <VisibilityToggle
        visible={form.visibility.birthday}
        onChange={(v) => updateVisibility('birthday', v)}
        disabled={togglesDisabled}
      />
    ),
    // notes: no visibility toggle (always private)
  }), [form, cardData.socialProfiles, cardData.urls, updateVisibility, togglesDisabled]);

  // Identity fields shown above the card with their own visibility toggles
  const identityFields: Array<{ key: 'firstName' | 'lastName' | 'company' | 'title' | 'tagline'; label: string; value: string | null }> = [
    { key: 'firstName', label: 'First name', value: form.firstName },
    { key: 'lastName', label: 'Last name', value: form.lastName },
    { key: 'company', label: 'Company', value: form.company },
    { key: 'title', label: 'Job title', value: form.title },
    { key: 'tagline', label: 'Tagline', value: form.tagline },
  ];

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
                      disabled={updateProfileMutation.isPending}
                      onChange={(e) => handlePublicToggle(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {form.isPublic && (
                  <button
                    type="button"
                    className="hide-all-btn"
                    disabled={updateProfileMutation.isPending}
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

            {/* Preview sidebar — only shown when public */}
            {form.isPublic && (
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
            {identityFields.some((f) => f.value) && (
              <div className="profile-identity-fields">
                {identityFields.filter((f) => f.value).map((f) => (
                  <div key={f.key} className="identity-field-row">
                    <div className="identity-field-text">
                      <span className="identity-field-label">{f.label}</span>
                      <span className="identity-field-value">{f.value}</span>
                    </div>
                    <VisibilityToggle
                      visible={form.visibility[f.key]}
                      onChange={(v) => updateVisibility(f.key, v)}
                      disabled={togglesDisabled}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="contact-detail-content">
              <ContactCardView data={cardData} showMetadata={false} sectionSuffixes={sectionSuffixes} />
            </div>
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
        </div>
      </div>

    </>
  );
}

