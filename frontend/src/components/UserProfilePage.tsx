import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUserProfile, useUpdateUserProfile } from '../api/profileHooks';
import { useAuth } from '../contexts/AuthContext';
import type {
  UpdateUserProfileRequest,
  ProfileEmail,
  ProfilePhone,
  ProfileAddress,
  ProfileSocialLink,
  ProfileVisibility,
} from '../api/types';
import { Avatar } from './Avatar';
import { MobileHeader } from './MobileHeader';
import {
  EditableField,
  EditableArrayItem,
  formatBirthday,
  getZodiacSign,
} from './ContactFormSections';

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

export function UserProfilePage() {
  const { isMobile } = useOutletContext<OutletContext>();
  const { user } = useAuth();
  const { data: profile, isLoading } = useUserProfile();
  const updateProfileMutation = useUpdateUserProfile();

  const [form, setForm] = useState<FormState>(getInitialFormState());
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load profile data into form
  useEffect(() => {
    if (profile) {
      setForm({
        isPublic: profile.isPublic,
        publicSlug: profile.publicSlug,
        avatarUrl: profile.avatarUrl || user?.avatarUrl || null,
        firstName: profile.firstName || user?.name?.split(' ')[0] || null,
        lastName: profile.lastName || user?.name?.split(' ').slice(1).join(' ') || null,
        tagline: profile.tagline,
        company: profile.company,
        title: profile.title,
        emails: profile.emails.length > 0 ? profile.emails : (user?.email ? [{ email: user.email, type: 'personal', isPrimary: true }] : []),
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
  }, [profile, user]);

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
      avatarUrl: form.avatarUrl,
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
              )}
            </div>

            {/* Basic info section */}
            <div className="profile-section">
              <h3 className="section-title">Basic Information</h3>

              {/* Avatar */}
              <div className="profile-field-row">
                <div className="profile-field with-visibility">
                  <label>Photo</label>
                  <div className="avatar-field">
                    <Avatar photoUrl={form.avatarUrl} name={form.firstName || 'User'} size={64} />
                    <EditableField
                      value={form.avatarUrl || ''}
                      onChange={(v) => updateForm('avatarUrl', v || null)}
                      placeholder="Avatar URL"
                    />
                  </div>
                </div>
                <VisibilityToggle
                  visible={form.visibility.avatar}
                  onChange={(v) => updateVisibility('avatar', v)}
                  disabled={!form.isPublic}
                />
              </div>

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

      <style>{`
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

        .copy-url-btn {
          padding: 8px;
          background: var(--stitch-card-bg);
          border: 1px solid var(--stitch-border);
          border-radius: 8px;
          cursor: pointer;
          color: var(--stitch-text-secondary);
          transition: all 0.2s;
        }

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

        .avatar-field {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .avatar-field .edit-input {
          flex: 1;
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
      `}</style>
    </>
  );
}
