import { useState, useCallback, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
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
import { MobileHeader } from './MobileHeader';
import {
  EditableField,
  EditableArrayItem,
} from './ContactFormSections';
import { formatBirthday, getZodiacSign } from '../utils/contactFormatters';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

// Default visibility settings
function getDefaultVisibility(): ProfileVisibility {
  return {
    avatar: true,
    firstName: true,
    lastName: true,
    tagline: true,
    company: true,
    title: true,
    emails: {},
    phones: {},
    addresses: {},
    website: true,
    linkedin: true,
    instagram: true,
    whatsapp: true,
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
      <span className="material-symbols-outlined">
        {visible ? 'visibility' : 'visibility_off'}
      </span>
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
          <span className="material-symbols-outlined">visibility_off</span>
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
    (e) => visibility.emails[e.email] !== false
  );
  const visiblePhones = form.phones.filter(
    (p) => visibility.phones[p.phone] !== false
  );
  const visibleAddresses = form.addresses.filter(
    (a) => a.id && visibility.addresses[a.id] !== false
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
              <span className="material-symbols-outlined">mail</span>
              <span>{email.email}</span>
            </div>
          ))}
          {visiblePhones.map((phone, i) => (
            <div key={`phone-${i}`} className="preview-item">
              <span className="material-symbols-outlined">call</span>
              <span>{phone.phoneDisplay}</span>
            </div>
          ))}
          {visibleAddresses.map((addr, i) => {
            const parts = [addr.street, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean);
            if (!parts.length) return null;
            return (
              <div key={`addr-${i}`} className="preview-item">
                <span className="material-symbols-outlined">location_on</span>
                <span>{parts.join(', ')}</span>
              </div>
            );
          })}
        </div>

        {/* Social links */}
        <div className="preview-social">
          {visibility.website && form.website && (
            <a href={form.website} target="_blank" rel="noopener noreferrer" className="preview-social-link">
              <span className="material-symbols-outlined">language</span>
            </a>
          )}
          {visibility.linkedin && form.linkedin && (
            <a href={form.linkedin} target="_blank" rel="noopener noreferrer" className="preview-social-link">
              <span className="material-symbols-outlined">work</span>
            </a>
          )}
          {visibility.instagram && form.instagram && (
            <a href={`https://instagram.com/${form.instagram}`} target="_blank" rel="noopener noreferrer" className="preview-social-link">
              <span className="material-symbols-outlined">photo_camera</span>
            </a>
          )}
          {visibility.whatsapp && form.whatsapp && (
            <a href={`https://wa.me/${form.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="preview-social-link">
              <span className="material-symbols-outlined">chat</span>
            </a>
          )}
        </div>

        {/* Birthday */}
        {visibility.birthday && form.birthday && (
          <div className="preview-birthday">
            <span className="material-symbols-outlined">cake</span>
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
        <span className="material-symbols-outlined">search</span>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your contacts..."
          className="search-input"
        />
        <button type="button" onClick={onCancel} className="cancel-btn">
          <span className="material-symbols-outlined">close</span>
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
        <span className="material-symbols-outlined">person_add</span>
      </div>
      <h2>Set Up Your Profile</h2>
      <p>Link your profile to a contact card to share your information publicly.</p>

      <div className="setup-options">
        <button type="button" className="setup-option" onClick={onConnect}>
          <div className="option-icon">
            <span className="material-symbols-outlined">link</span>
          </div>
          <div className="option-content">
            <strong>Connect to Existing Contact</strong>
            <span>Search and link to a contact in your address book</span>
          </div>
        </button>

        {!showCreateInput ? (
          <button type="button" className="setup-option" onClick={() => setShowCreateInput(true)}>
            <div className="option-icon">
              <span className="material-symbols-outlined">add_circle</span>
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
          <span className="material-symbols-outlined">link_off</span>
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
  const { isMobile } = useOutletContext<OutletContext>();
  const { user } = useAuth();
  const { data: profile, isLoading } = useUserProfile();
  const updateProfileMutation = useUpdateUserProfile();
  const linkMutation = useLinkProfileToContact();
  const unlinkMutation = useUnlinkProfile();
  const createMutation = useCreateProfileContact();

  const [form, setForm] = useState<FormState>(getInitialFormState);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConnectSearch, setShowConnectSearch] = useState(false);

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
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
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

  // Email handlers
  const addEmail = () => {
    updateForm('emails', [...form.emails, { email: '', type: null, isPrimary: form.emails.length === 0 }]);
  };
  const updateEmail = (index: number, field: keyof ProfileEmail, value: string | boolean) => {
    const updated = [...form.emails];
    updated[index] = { ...updated[index], [field]: value };
    updateForm('emails', updated);
  };
  const removeEmail = (index: number) => {
    updateForm('emails', form.emails.filter((_, i) => i !== index));
  };

  // Phone handlers
  const addPhone = () => {
    updateForm('phones', [...form.phones, { phone: '', phoneDisplay: '', countryCode: null, type: null, isPrimary: form.phones.length === 0 }]);
  };
  const updatePhone = (index: number, field: keyof ProfilePhone, value: string | boolean) => {
    const updated = [...form.phones];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'phone') {
      updated[index].phoneDisplay = value as string;
    }
    updateForm('phones', updated);
  };
  const removePhone = (index: number) => {
    updateForm('phones', form.phones.filter((_, i) => i !== index));
  };

  // Address handlers
  const addAddress = () => {
    updateForm('addresses', [...form.addresses, { id: `new-${Date.now()}`, street: null, city: null, state: null, postalCode: null, country: null, type: null }]);
  };
  const updateAddress = (index: number, field: keyof ProfileAddress, value: string | null) => {
    const updated = [...form.addresses];
    updated[index] = { ...updated[index], [field]: value || null };
    updateForm('addresses', updated);
  };
  const removeAddress = (index: number) => {
    updateForm('addresses', form.addresses.filter((_, i) => i !== index));
  };

  // Social link handlers
  const addSocialLink = () => {
    updateForm('otherSocialLinks', [...form.otherSocialLinks, { id: `new-${Date.now()}`, platform: '', username: '', profileUrl: null }]);
  };
  const updateSocialLink = (index: number, field: keyof ProfileSocialLink, value: string | null) => {
    const updated = [...form.otherSocialLinks];
    updated[index] = { ...updated[index], [field]: value };
    updateForm('otherSocialLinks', updated);
  };
  const removeSocialLink = (index: number) => {
    updateForm('otherSocialLinks', form.otherSocialLinks.filter((_, i) => i !== index));
  };

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
        {isMobile ? (
          <MobileHeader title="Connect to Contact" />
        ) : (
          <header className="top-header">
            <div className="page-header">
              <h1>Connect to Contact</h1>
            </div>
          </header>
        )}
        <div className="page-content">
          <ContactSearchAutocomplete
            onSelect={handleLinkContact}
            onCancel={() => setShowConnectSearch(false)}
          />
        </div>
        <style>{profileStyles}</style>
      </>
    );
  }

  // Show unlinked state if no linked contact
  if (!profile?.linkedContactId) {
    return (
      <>
        {isMobile ? (
          <MobileHeader title="Profile" />
        ) : (
          <header className="top-header">
            <div className="page-header">
              <h1>Profile</h1>
            </div>
          </header>
        )}
        <div className="page-content">
          {error && (
            <div className="edit-error">
              <span className="material-symbols-outlined">error</span>
              {error}
            </div>
          )}
          <UnlinkedProfileState
            onConnect={() => setShowConnectSearch(true)}
            onCreate={handleCreateProfileContact}
            userName={user?.name || null}
          />
        </div>
        <style>{profileStyles}</style>
      </>
    );
  }

  // Linked state - show full profile editor
  return (
    <>
      {isMobile ? (
        <MobileHeader title="Profile" />
      ) : (
        <header className="top-header">
          <div className="page-header">
            <h1>Profile</h1>
          </div>
          <div className="header-actions">
            {hasChanges && (
              <button
                className="primary-button"
                onClick={handleSave}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <span className="material-symbols-outlined spinning">sync</span>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">save</span>
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            )}
            {saveSuccess && (
              <span className="save-success">
                <span className="material-symbols-outlined">check_circle</span>
                Saved
              </span>
            )}
          </div>
        </header>
      )}

      <div className="page-content">
        <div className="profile-page-layout">
          {/* Left panel: Edit form */}
          <div className="profile-edit-panel">
            {/* Error message */}
            {error && (
              <div className="edit-error">
                <span className="material-symbols-outlined">error</span>
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
                  <span className="material-symbols-outlined">public</span>
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

              {form.isPublic && profile?.publicUrl && (
                <div className="public-url-row">
                  <div className="public-url-display">
                    <span className="material-symbols-outlined">link</span>
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
                      <span className="material-symbols-outlined">open_in_new</span>
                    </a>
                    <button
                      type="button"
                      className="copy-url-btn"
                      onClick={handleCopyUrl}
                      title="Copy URL"
                    >
                      <span className="material-symbols-outlined">
                        {copySuccess ? 'check' : 'content_copy'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Basic info section */}
            <div className="profile-section">
              <h3 className="section-title">Basic Information</h3>

              {/* First Name */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>First Name</label>
                  <EditableField
                    value={form.firstName || ''}
                    onChange={(v) => updateForm('firstName', v || null)}
                    placeholder="First name"
                  />
                </div>
                <VisibilityToggle
                  visible={form.visibility.firstName}
                  onChange={(v) => updateVisibility('firstName', v)}
                  disabled={!form.isPublic}
                />
              </div>

              {/* Last Name */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>Last Name</label>
                  <EditableField
                    value={form.lastName || ''}
                    onChange={(v) => updateForm('lastName', v || null)}
                    placeholder="Last name"
                  />
                </div>
                <VisibilityToggle
                  visible={form.visibility.lastName}
                  onChange={(v) => updateVisibility('lastName', v)}
                  disabled={!form.isPublic}
                />
              </div>

              {/* Tagline */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>Tagline</label>
                  <EditableField
                    value={form.tagline || ''}
                    onChange={(v) => updateForm('tagline', v || null)}
                    placeholder="3-word self-description"
                  />
                </div>
                <VisibilityToggle
                  visible={form.visibility.tagline}
                  onChange={(v) => updateVisibility('tagline', v)}
                  disabled={!form.isPublic}
                />
              </div>

              {/* Company */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>Company</label>
                  <EditableField
                    value={form.company || ''}
                    onChange={(v) => updateForm('company', v || null)}
                    placeholder="Company or organization"
                  />
                </div>
                <VisibilityToggle
                  visible={form.visibility.company}
                  onChange={(v) => updateVisibility('company', v)}
                  disabled={!form.isPublic}
                />
              </div>

              {/* Job Title */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>Job Title</label>
                  <EditableField
                    value={form.title || ''}
                    onChange={(v) => updateForm('title', v || null)}
                    placeholder="Job title"
                  />
                </div>
                <VisibilityToggle
                  visible={form.visibility.title}
                  onChange={(v) => updateVisibility('title', v)}
                  disabled={!form.isPublic}
                />
              </div>
            </div>

            {/* Contact info section */}
            <div className="profile-section">
              <h3 className="section-title">Contact Information</h3>

              {/* Emails */}
              <div className="profile-array-field">
                <label>Email Addresses</label>
                {form.emails.map((email, i) => (
                  <div key={`email-${i}`} className="profile-field-row">
                    <EditableArrayItem onRemove={() => removeEmail(i)}>
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
                    <VisibilityToggle
                      visible={form.visibility.emails[email.email] !== false}
                      onChange={(v) =>
                        updateVisibility('emails', { ...form.visibility.emails, [email.email]: v })
                      }
                      disabled={!form.isPublic}
                    />
                  </div>
                ))}
                <button type="button" className="add-item-btn" onClick={addEmail}>
                  <span className="material-symbols-outlined">add</span>
                  Add Email
                </button>
              </div>

              {/* Phones */}
              <div className="profile-array-field">
                <label>Phone Numbers</label>
                {form.phones.map((phone, i) => (
                  <div key={`phone-${i}`} className="profile-field-row">
                    <EditableArrayItem onRemove={() => removePhone(i)}>
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
                          placeholder="Type (mobile, home...)"
                        />
                      </div>
                    </EditableArrayItem>
                    <VisibilityToggle
                      visible={form.visibility.phones[phone.phone] !== false}
                      onChange={(v) =>
                        updateVisibility('phones', { ...form.visibility.phones, [phone.phone]: v })
                      }
                      disabled={!form.isPublic}
                    />
                  </div>
                ))}
                <button type="button" className="add-item-btn" onClick={addPhone}>
                  <span className="material-symbols-outlined">add</span>
                  Add Phone
                </button>
              </div>

              {/* Addresses */}
              <div className="profile-array-field">
                <label>Addresses</label>
                {form.addresses.map((addr, i) => (
                  <div key={`addr-${i}`} className="profile-field-row address-row">
                    <EditableArrayItem onRemove={() => removeAddress(i)}>
                      <span className="material-symbols-outlined">location_on</span>
                      <div className="edit-field-group address-fields">
                        <EditableField
                          value={addr.street || ''}
                          onChange={(v) => updateAddress(i, 'street', v)}
                          placeholder="Street"
                        />
                        <div className="address-row-inner">
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
                        <div className="address-row-inner">
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
                    <VisibilityToggle
                      visible={addr.id ? form.visibility.addresses[addr.id] !== false : true}
                      onChange={(v) =>
                        addr.id && updateVisibility('addresses', { ...form.visibility.addresses, [addr.id]: v })
                      }
                      disabled={!form.isPublic}
                    />
                  </div>
                ))}
                <button type="button" className="add-item-btn" onClick={addAddress}>
                  <span className="material-symbols-outlined">add</span>
                  Add Address
                </button>
              </div>
            </div>

            {/* Social & Web section */}
            <div className="profile-section">
              <h3 className="section-title">Social & Web</h3>

              {/* Website */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>Website</label>
                  <EditableField
                    value={form.website || ''}
                    onChange={(v) => updateForm('website', v || null)}
                    placeholder="https://example.com"
                  />
                </div>
                <VisibilityToggle
                  visible={form.visibility.website}
                  onChange={(v) => updateVisibility('website', v)}
                  disabled={!form.isPublic}
                />
              </div>

              {/* LinkedIn */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>LinkedIn</label>
                  <EditableField
                    value={form.linkedin || ''}
                    onChange={(v) => updateForm('linkedin', v || null)}
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>
                <VisibilityToggle
                  visible={form.visibility.linkedin}
                  onChange={(v) => updateVisibility('linkedin', v)}
                  disabled={!form.isPublic}
                />
              </div>

              {/* Instagram */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>Instagram</label>
                  <EditableField
                    value={form.instagram || ''}
                    onChange={(v) => updateForm('instagram', v || null)}
                    placeholder="username"
                  />
                </div>
                <VisibilityToggle
                  visible={form.visibility.instagram}
                  onChange={(v) => updateVisibility('instagram', v)}
                  disabled={!form.isPublic}
                />
              </div>

              {/* WhatsApp */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>WhatsApp</label>
                  <EditableField
                    value={form.whatsapp || ''}
                    onChange={(v) => updateForm('whatsapp', v || null)}
                    placeholder="+1234567890"
                  />
                </div>
                <VisibilityToggle
                  visible={form.visibility.whatsapp}
                  onChange={(v) => updateVisibility('whatsapp', v)}
                  disabled={!form.isPublic}
                />
              </div>

              {/* Other social links */}
              <div className="profile-array-field">
                <label>Other Social Links</label>
                {form.otherSocialLinks.map((link, i) => (
                  <div key={`social-${i}`} className="profile-field-row">
                    <EditableArrayItem onRemove={() => removeSocialLink(i)}>
                      <span className="material-symbols-outlined">link</span>
                      <div className="edit-field-group">
                        <EditableField
                          value={link.platform}
                          onChange={(v) => updateSocialLink(i, 'platform', v)}
                          placeholder="Platform (Twitter, GitHub...)"
                        />
                        <EditableField
                          value={link.username}
                          onChange={(v) => updateSocialLink(i, 'username', v)}
                          placeholder="Username"
                        />
                        <EditableField
                          value={link.profileUrl || ''}
                          onChange={(v) => updateSocialLink(i, 'profileUrl', v || null)}
                          placeholder="Profile URL"
                        />
                      </div>
                    </EditableArrayItem>
                    <VisibilityToggle
                      visible={link.id ? form.visibility.otherSocialLinks[link.id] !== false : true}
                      onChange={(v) =>
                        link.id && updateVisibility('otherSocialLinks', { ...form.visibility.otherSocialLinks, [link.id]: v })
                      }
                      disabled={!form.isPublic}
                    />
                  </div>
                ))}
                <button type="button" className="add-item-btn" onClick={addSocialLink}>
                  <span className="material-symbols-outlined">add</span>
                  Add Social Link
                </button>
              </div>
            </div>

            {/* Personal section */}
            <div className="profile-section">
              <h3 className="section-title">Personal</h3>

              {/* Birthday */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>Birthday</label>
                  <div className="birthday-field">
                    <EditableField
                      value={form.birthday || ''}
                      onChange={(v) => updateForm('birthday', v || null)}
                      placeholder="YYYY-MM-DD"
                      type="date"
                    />
                    {form.birthday && (
                      <span className="birthday-preview">
                        {formatBirthday(form.birthday)}
                        {getZodiacSign(form.birthday) && (
                          <img
                            src={`/zodiac/${getZodiacSign(form.birthday)}.svg`}
                            alt={getZodiacSign(form.birthday) || ''}
                            className="zodiac-icon-small"
                          />
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <VisibilityToggle
                  visible={form.visibility.birthday}
                  onChange={(v) => updateVisibility('birthday', v)}
                  disabled={!form.isPublic}
                />
              </div>

              {/* Notes (private only) */}
              <div className="profile-field-row notes-row">
                <div className="profile-field full-width">
                  <label>
                    Notes
                    <span className="private-badge">Private</span>
                  </label>
                  <textarea
                    value={form.notes || ''}
                    onChange={(e) => updateForm('notes', e.target.value || null)}
                    placeholder="Private notes about yourself..."
                    className="notes-textarea"
                    rows={4}
                  />
                </div>
              </div>
            </div>

            {/* Mobile save button */}
            {isMobile && hasChanges && (
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

          {/* Right panel: Live preview */}
          <div className="profile-preview-panel">
            <div className="preview-panel-header">
              <h3>Public Card Preview</h3>
              <p>This is how others will see your contact card</p>
            </div>
            <PublicCardPreview form={form} isPublic={form.isPublic} />
          </div>
        </div>
      </div>

      <style>{profileStyles}</style>
    </>
  );
}

const profileStyles = `
  .profile-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    color: var(--stitch-text-secondary);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--stitch-border);
    border-top-color: var(--stitch-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Unlinked state styles */
  .unlinked-profile-state {
    max-width: 500px;
    margin: 48px auto;
    text-align: center;
    padding: 24px;
  }

  .setup-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea20, #764ba220);
    border-radius: 50%;
  }

  .setup-icon .material-symbols-outlined {
    font-size: 40px;
    color: var(--stitch-primary);
  }

  .unlinked-profile-state h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
  }

  .unlinked-profile-state > p {
    color: var(--stitch-text-secondary);
    margin: 0 0 32px 0;
  }

  .setup-options {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .setup-option {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: var(--stitch-card-bg);
    border: 1px solid var(--stitch-border);
    border-radius: 12px;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
  }

  .setup-option:hover {
    border-color: var(--stitch-primary);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  }

  .option-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--stitch-border);
    border-radius: 12px;
    flex-shrink: 0;
  }

  .option-icon .material-symbols-outlined {
    font-size: 24px;
    color: var(--stitch-primary);
  }

  .option-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .option-content strong {
    font-size: 16px;
  }

  .option-content span {
    font-size: 14px;
    color: var(--stitch-text-secondary);
  }

  .create-input-wrapper {
    padding: 20px;
    background: var(--stitch-card-bg);
    border: 1px solid var(--stitch-primary);
    border-radius: 12px;
  }

  .create-name-input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--stitch-border);
    border-radius: 8px;
    font-size: 16px;
    margin-bottom: 16px;
  }

  .create-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  /* Linked profile header */
  .linked-profile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: linear-gradient(135deg, #667eea10, #764ba210);
    border: 1px solid #667eea30;
    border-radius: 12px;
    margin-bottom: 24px;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-info h3 {
    margin: 0;
    font-size: 18px;
  }

  .header-info p {
    margin: 4px 0 0 0;
    font-size: 13px;
    color: var(--stitch-text-secondary);
  }

  .unlink-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--stitch-border);
    border-radius: 8px;
    cursor: pointer;
    color: var(--stitch-text-secondary);
    font-size: 14px;
    transition: all 0.2s;
  }

  .unlink-btn:hover {
    border-color: #ef4444;
    color: #ef4444;
  }

  .unlink-confirm {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .unlink-confirm p {
    margin: 0;
    font-size: 14px;
    color: var(--stitch-text-secondary);
  }

  .confirm-actions {
    display: flex;
    gap: 8px;
  }

  .danger-button {
    padding: 8px 16px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .danger-button:hover {
    background: #dc2626;
  }

  /* Contact search autocomplete */
  .contact-search-autocomplete {
    max-width: 600px;
    margin: 24px auto;
    background: var(--stitch-card-bg);
    border: 1px solid var(--stitch-border);
    border-radius: 12px;
    overflow: hidden;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--stitch-border);
  }

  .search-input-wrapper .material-symbols-outlined {
    color: var(--stitch-text-secondary);
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 16px;
    outline: none;
  }

  .cancel-btn {
    padding: 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--stitch-text-secondary);
    border-radius: 6px;
    transition: all 0.2s;
  }

  .cancel-btn:hover {
    background: var(--stitch-border);
  }

  .search-results {
    max-height: 400px;
    overflow-y: auto;
  }

  .search-loading,
  .no-results {
    padding: 24px;
    text-align: center;
    color: var(--stitch-text-secondary);
  }

  .results-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s;
  }

  .result-item:hover {
    background: var(--stitch-border);
  }

  .result-info {
    display: flex;
    flex-direction: column;
  }

  .result-info strong {
    font-size: 15px;
  }

  .result-detail {
    font-size: 13px;
    color: var(--stitch-text-secondary);
  }

  /* Profile page layout */
  .profile-page-layout {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: 32px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  }

  @media (max-width: 1024px) {
    .profile-page-layout {
      grid-template-columns: 1fr;
    }

    .profile-preview-panel {
      order: -1;
    }
  }

  @media (max-width: 768px) {
    .profile-page-layout {
      padding: 16px;
    }
  }

  .profile-edit-panel {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .profile-section {
    background: var(--stitch-card-bg);
    border: 1px solid var(--stitch-border);
    border-radius: 12px;
    padding: 20px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: var(--stitch-text-main);
  }

  .public-card-controls {
    background: linear-gradient(135deg, #667eea15, #764ba215);
    border-color: #667eea30;
  }

  .public-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .public-toggle-label {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .public-toggle-label .material-symbols-outlined {
    font-size: 28px;
    color: var(--stitch-primary);
  }

  .public-toggle-label strong {
    display: block;
    font-size: 15px;
  }

  .public-toggle-label p {
    margin: 2px 0 0 0;
    font-size: 13px;
    color: var(--stitch-text-secondary);
  }

  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 52px;
    height: 28px;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: var(--stitch-border);
    transition: 0.3s;
    border-radius: 28px;
  }

  .toggle-slider::before {
    position: absolute;
    content: "";
    height: 22px;
    width: 22px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  .toggle-switch input:checked + .toggle-slider {
    background-color: var(--stitch-primary);
  }

  .toggle-switch input:checked + .toggle-slider::before {
    transform: translateX(24px);
  }

  .public-url-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--stitch-border);
  }

  .public-url-display {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--stitch-card-bg);
    border-radius: 8px;
    overflow: hidden;
  }

  .public-url-display code {
    font-size: 13px;
    color: var(--stitch-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .public-url-actions {
    display: flex;
    gap: 8px;
  }

  .view-card-btn,
  .copy-url-btn {
    padding: 8px;
    background: var(--stitch-card-bg);
    border: 1px solid var(--stitch-border);
    border-radius: 8px;
    cursor: pointer;
    color: var(--stitch-text-secondary);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }

  .view-card-btn:hover,
  .copy-url-btn:hover {
    background: var(--stitch-primary);
    color: white;
    border-color: var(--stitch-primary);
  }

  .profile-field-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 12px;
  }

  .profile-field-row.address-row {
    align-items: flex-start;
  }

  .profile-field-row.notes-row {
    display: block;
  }

  .profile-field {
    flex: 1;
  }

  .profile-field.with-visibility {
    flex: 1;
  }

  .profile-field.full-width {
    width: 100%;
  }

  .profile-field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--stitch-text-secondary);
    margin-bottom: 4px;
  }

  .profile-array-field {
    margin-bottom: 16px;
  }

  .profile-array-field > label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--stitch-text-secondary);
    margin-bottom: 8px;
  }

  .visibility-toggle {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 20px;
  }

  .visibility-toggle.visible {
    background: #667eea20;
    color: var(--stitch-primary);
  }

  .visibility-toggle.hidden {
    background: var(--stitch-border);
    color: var(--stitch-text-secondary);
  }

  .visibility-toggle.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .visibility-toggle:hover:not(.disabled) {
    transform: scale(1.05);
  }

  .birthday-field {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .birthday-preview {
    font-size: 13px;
    color: var(--stitch-text-secondary);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .zodiac-icon-small {
    width: 20px;
    height: 20px;
  }

  .private-badge {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    background: var(--stitch-border);
    border-radius: 4px;
    color: var(--stitch-text-secondary);
  }

  .notes-textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--stitch-border);
    border-radius: 8px;
    font-size: 14px;
    resize: vertical;
    font-family: inherit;
  }

  .address-fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .address-row-inner {
    display: flex;
    gap: 8px;
  }

  .address-row-inner .edit-input {
    flex: 1;
  }

  /* Preview panel */
  .profile-preview-panel {
    position: sticky;
    top: 24px;
    height: fit-content;
  }

  .preview-panel-header {
    margin-bottom: 16px;
  }

  .preview-panel-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .preview-panel-header p {
    margin: 4px 0 0 0;
    font-size: 13px;
    color: var(--stitch-text-secondary);
  }

  .public-card-preview {
    background: var(--stitch-card-bg);
    border: 1px solid var(--stitch-border);
    border-radius: 16px;
    overflow: hidden;
  }

  .public-card-preview.disabled {
    background: var(--stitch-border);
  }

  .preview-disabled-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
    color: var(--stitch-text-secondary);
  }

  .preview-disabled-message .material-symbols-outlined {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .preview-disabled-message p {
    margin: 4px 0;
    font-size: 14px;
  }

  .preview-card {
    padding: 24px;
  }

  .preview-avatar {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  .preview-header {
    text-align: center;
    margin-bottom: 20px;
  }

  .preview-name {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
  }

  .preview-tagline {
    margin: 4px 0 0 0;
    font-size: 14px;
    color: var(--stitch-primary);
    font-style: italic;
  }

  .preview-title,
  .preview-company {
    margin: 4px 0 0 0;
    font-size: 14px;
    color: var(--stitch-text-secondary);
  }

  .preview-contact-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .preview-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  .preview-item .material-symbols-outlined {
    font-size: 18px;
    color: var(--stitch-text-secondary);
  }

  .preview-social {
    display: flex;
    justify-content: center;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--stitch-border);
  }

  .preview-social-link {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--stitch-border);
    border-radius: 50%;
    color: var(--stitch-text-secondary);
    transition: all 0.2s;
  }

  .preview-social-link:hover {
    background: var(--stitch-primary);
    color: white;
  }

  .preview-birthday {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--stitch-border);
    font-size: 14px;
    color: var(--stitch-text-secondary);
  }

  /* Save success indicator */
  .save-success {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #10b981;
    font-size: 14px;
  }

  /* Mobile save bar */
  .mobile-save-bar {
    position: fixed;
    bottom: 60px;
    left: 0;
    right: 0;
    padding: 16px;
    background: var(--stitch-card-bg);
    border-top: 1px solid var(--stitch-border);
    z-index: 100;
  }

  .mobile-save-bar .full-width {
    width: 100%;
  }

  /* Buttons */
  .primary-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    background: var(--stitch-primary);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .primary-button:hover:not(:disabled) {
    background: #5567dc;
  }

  .primary-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .secondary-button {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--stitch-border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    color: var(--stitch-text-secondary);
    transition: all 0.2s;
  }

  .secondary-button:hover {
    background: var(--stitch-border);
  }

  /* Inherit styles from ContactFormSections */
  .edit-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--stitch-border);
    border-radius: 6px;
    font-size: 14px;
  }

  .editable-array-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex: 1;
    padding: 8px;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 8px;
  }

  .editable-array-item .material-symbols-outlined {
    margin-top: 8px;
    color: var(--stitch-text-secondary);
  }

  .edit-field-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .remove-item-btn {
    padding: 4px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--stitch-text-secondary);
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .remove-item-btn:hover {
    opacity: 1;
    color: #ef4444;
  }

  .add-item-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: 1px dashed var(--stitch-border);
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    color: var(--stitch-text-secondary);
    font-size: 14px;
    transition: all 0.2s;
  }

  .add-item-btn:hover {
    border-color: var(--stitch-primary);
    color: var(--stitch-primary);
  }

  .edit-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: #fee2e2;
    border-radius: 8px;
    color: #dc2626;
    font-size: 14px;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }
`;
