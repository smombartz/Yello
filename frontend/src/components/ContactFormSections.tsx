import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson, LinkedFromEntry, ContactSearchResult, LinkedInEnrichment } from '../api/types';
import { getCountryFlag, getCountryName } from '../lib/phoneUtils';
import { formatAddressLines } from '../lib/addressUtils';
import { Icon } from './Icon';
import { useToast } from './ui/Toast';
import { RelatedPersonNameField } from './RelatedPersonNameField';
import {
  formatBirthday,
  getZodiacSign,
  getPlatformIcon,
  getPlatformIconStyle,
  detectSocialProfile,
  getServiceIcon,
  getUrlIcon,
  getDisplayLabel,
  getRelationshipIcon
} from '../utils/contactFormatters';

// ─── Shared helpers ──────────────────────────────────────────────

function SectionHeading({ icon, label, iconStyle, zodiacSign }: {
  icon: string;
  label: string;
  iconStyle?: 'solid' | 'regular' | 'brands';
  zodiacSign?: string | null;
}) {
  return (
    <div className="section-heading">
      <div className="section-heading-row">
        {zodiacSign ? (
          <img
            src={`/zodiac/${zodiacSign}.svg`}
            alt={zodiacSign}
            className="zodiac-icon"
            title={zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1)}
          />
        ) : (
          <Icon name={icon} style={iconStyle} />
        )}
        <span className="section-heading-label">{label}</span>
      </div>
    </div>
  );
}

function InfoField({ icon, iconStyle, children, flagEmoji, actions }: {
  icon?: string;
  iconStyle?: 'solid' | 'regular' | 'brands';
  children: React.ReactNode;
  flagEmoji?: string;
  /** Rendered beside the value (not inside it) so a long value truncates without hiding them. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="info-field">
      <div className="info-field-icon">
        {flagEmoji ? (
          <span className="flag-emoji">{flagEmoji}</span>
        ) : icon ? (
          <Icon name={icon} style={iconStyle} />
        ) : null}
      </div>
      <div className="info-field-value">
        {children}
      </div>
      {actions && <div className="info-field-actions">{actions}</div>}
    </div>
  );
}

/** A contact value (phone, email) that copies itself to the clipboard on click. */
function CopyableValue({ value, title }: { value: string; title?: string }) {
  const { showToast } = useToast();
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      showToast(`Copied ${value}`, { duration: 2000 });
    } catch {
      showToast("Couldn't copy to clipboard", { type: 'error' });
    }
  };
  return (
    <button type="button" className="copyable-value" onClick={copy} title={title ?? 'Click to copy'}>
      {value}
    </button>
  );
}

function ContactActionLink({ href, icon, iconStyle, label, external, className }: {
  href: string;
  icon: string;
  iconStyle?: 'solid' | 'regular' | 'brands';
  label: string;
  external?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`contact-action-link${className ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <Icon name={icon} style={iconStyle} />
    </a>
  );
}

/** Text / call / WhatsApp links for a phone number. wa.me wants a digits-only number. */
function PhoneActions({ phone }: { phone: string }) {
  const dialable = phone.replace(/[^\d+]/g, '');
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return (
    <>
      <ContactActionLink href={`sms:${dialable}`} icon="comment-sms" label="Send text" />
      <ContactActionLink href={`tel:${dialable}`} icon="phone" label="Call" />
      <ContactActionLink
        href={`https://wa.me/${digits}`}
        icon="whatsapp"
        iconStyle="brands"
        label="Message on WhatsApp"
        external
        className="whatsapp"
      />
    </>
  );
}

function EmailActions({ email }: { email: string }) {
  if (!email) return null;
  return <ContactActionLink href={`mailto:${email}`} icon="envelope" label="Send email" />;
}

function getEmailIcon(email: string): { icon: string; style?: 'solid' | 'regular' | 'brands' } {
  const lower = email.toLowerCase();
  if (lower.includes('@gmail') || lower.includes('@googlemail')) return { icon: 'google', style: 'brands' };
  if (lower.includes('@yahoo')) return { icon: 'yahoo', style: 'brands' };
  if (lower.includes('@outlook') || lower.includes('@hotmail') || lower.includes('@live.') || lower.includes('@msn.')) return { icon: 'microsoft', style: 'brands' };
  if (lower.includes('@icloud') || lower.includes('@me.com') || lower.includes('@mac.com')) return { icon: 'apple', style: 'brands' };
  return { icon: 'globe' };
}

// ─── Editable components (shared) ────────────────────────────────

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

/** A failed save: the server's message, and/or the entries that stopped the save (`buildContactLists`). */
export function SaveErrors({ message, problems }: { message: string | null; problems: string[] }) {
  if (!message && problems.length === 0) return null;
  return (
    <div className="edit-error" role="alert">
      <Icon name="circle-exclamation" />
      <div className="edit-error-body">
        {message && <p>{message}</p>}
        {problems.length > 0 && (
          <>
            <p>Nothing was saved. Fill in or remove:</p>
            <ul>
              {problems.map((problem, i) => <li key={i}>{problem}</li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Without `onRemove` (an auto-added blank row) a spacer keeps the inputs aligned with the rows above. */
export function EditableArrayItem({
  children,
  onRemove
}: {
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <div className="editable-array-item">
      {children}
      {onRemove ? (
        <button type="button" className="remove-item-btn" onClick={onRemove} title="Remove">
          <Icon name="xmark" />
        </button>
      ) : (
        <span className="remove-item-spacer" aria-hidden="true" />
      )}
    </div>
  );
}

// ─── Auto-added blank row ────────────────────────────────────────

/**
 * Edit lists have no "Add …" button: they always end in one blank row. Typing
 * into it makes it a real entry and a fresh blank appears beneath. Blank rows
 * never reach the parent's state — trailing blanks are trimmed on every change,
 * so clearing the last entry turns it back into the blank.
 */
function autoRows<T>(
  items: T[],
  isBlank: (item: T) => boolean,
  makeBlank: () => T,
  onChange?: (items: T[]) => void,
) {
  const blankIndex = items.length === 0 || !isBlank(items[items.length - 1]) ? items.length : -1;
  const rows = blankIndex === -1 ? items : [...items, makeBlank()];

  const commit = (next: T[]) => {
    if (!onChange) return;
    let end = next.length;
    while (end > 0 && isBlank(next[end - 1])) end--;
    onChange(next.slice(0, end));
  };

  return { rows, blankIndex, commit };
}

// ─── Drag-and-drop support ───────────────────────────────────────

function useDragState() {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropZoneIndex, setDropZoneIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragEnd = () => { setDraggedIndex(null); setDropZoneIndex(null); };
  const handleDragOver = (index: number) => setDropZoneIndex(index);

  const handleDrop = <T,>(
    fromIndex: number,
    toIndex: number,
    items: T[],
    onItemsChange: (items: T[]) => void
  ) => {
    const updated = [...items];
    const [movedItem] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedItem);

    const result = updated.map((item, idx) => {
      if (item && typeof item === 'object' && 'isPrimary' in item) {
        return { ...item, isPrimary: idx === 0 };
      }
      return item;
    });

    onItemsChange(result);
    setDraggedIndex(null);
    setDropZoneIndex(null);
  };

  return { draggedIndex, dropZoneIndex, handleDragStart, handleDragEnd, handleDragOver, handleDrop };
}

function DraggableArrayItem({
  index,
  draggedIndex,
  dropZoneIndex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRemove,
  isBlankRow,
  children,
}: {
  index: number;
  draggedIndex: number | null;
  dropZoneIndex: number | null;
  onDragStart: (index: number) => void;
  onDragEnd: () => void;
  onDragOver: (index: number) => void;
  onDrop: (fromIndex: number, toIndex: number) => void;
  onRemove: () => void;
  /** The auto-added blank row: not draggable, not a drop target, nothing to remove. */
  isBlankRow?: boolean;
  children: React.ReactNode;
}) {
  if (isBlankRow) {
    return (
      <div className="draggable-array-item">
        <EditableArrayItem>{children}</EditableArrayItem>
      </div>
    );
  }

  return (
    <div
      draggable
      className={`draggable-array-item${draggedIndex === index ? ' dragging' : ''}${dropZoneIndex === index ? ' drag-over' : ''}`}
      onDragStart={() => onDragStart(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => {
        if (draggedIndex !== null && draggedIndex !== index) {
          onDrop(draggedIndex, index);
        }
      }}
    >
      <EditableArrayItem onRemove={onRemove}>
        {children}
      </EditableArrayItem>
    </div>
  );
}

// ─── PhoneSection ────────────────────────────────────────────────

export function PhoneSection({ phones, isEditMode, onPhonesChange, initialLimit = 3, renderItemSuffix }: {
  phones: ContactPhone[];
  isEditMode: boolean;
  onPhonesChange?: (phones: ContactPhone[]) => void;
  initialLimit?: number;
  renderItemSuffix?: (index: number) => React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);

  const dragState = useDragState();

  if (!isEditMode && !phones.length) return null;

  const newPhone = (): ContactPhone => ({ phone: '', phoneDisplay: '', countryCode: null, type: null, isPrimary: phones.length === 0 });
  const { rows, blankIndex, commit } = autoRows(
    phones, p => !p.phone && !p.phoneDisplay && !p.type, newPhone, onPhonesChange,
  );


  const updatePhone = (index: number, field: keyof ContactPhone, value: string | boolean) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'phone') {
      updated[index].phoneDisplay = value as string;
    }
    commit(updated);
  };

  const removePhone = (index: number) => commit(phones.filter((_, i) => i !== index));


  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Phone</h4>
        <div className="section-content edit-section-content">
          {rows.map((phone, i) => (
            <div key={`phone-${i}`} className={renderItemSuffix ? 'edit-item-with-suffix' : undefined}>
              <DraggableArrayItem
                index={i}
                isBlankRow={i === blankIndex}
                draggedIndex={dragState.draggedIndex}
                dropZoneIndex={dragState.dropZoneIndex}
                onDragStart={dragState.handleDragStart}
                onDragEnd={dragState.handleDragEnd}
                onDragOver={dragState.handleDragOver}
                onDrop={(from, to) => dragState.handleDrop(from, to, phones, onPhonesChange || (() => {}))}
                onRemove={() => removePhone(i)}
              >
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
              </DraggableArrayItem>
              {i !== blankIndex && renderItemSuffix?.(i)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const visible = showAll ? phones : phones.slice(0, initialLimit);
  const remaining = phones.length - initialLimit;

  return (
    <div className="expanded-section-view">
      <SectionHeading icon="phone" label="Phone" />
      {visible.map((phone, i) => {
        const flag = getCountryFlag(phone.countryCode);
        const countryName = getCountryName(phone.countryCode);
        const field = (
          <InfoField
            flagEmoji={flag || undefined}
            icon={!flag ? 'phone' : undefined}
            actions={<PhoneActions phone={phone.phone} />}
          >
            <CopyableValue
              value={phone.phoneDisplay}
              title={countryName ? `${countryName} · Click to copy` : undefined}
            />
          </InfoField>
        );
        return renderItemSuffix ? (
          <div key={`phone-${i}`} className="view-item-with-suffix">
            {field}
            {renderItemSuffix(i)}
          </div>
        ) : (
          <React.Fragment key={`phone-${i}`}>{field}</React.Fragment>
        );
      })}
      {!showAll && remaining > 0 && (
        <div className="show-more-link">
          <button className="show-more-button" onClick={() => setShowAll(true)}>
            Show {remaining} additional number{remaining !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── EmailSection ────────────────────────────────────────────────

export function EmailSection({ emails, isEditMode, onEmailsChange, initialLimit = 3, renderItemSuffix }: {
  emails: ContactEmail[];
  isEditMode: boolean;
  onEmailsChange?: (emails: ContactEmail[]) => void;
  initialLimit?: number;
  renderItemSuffix?: (index: number) => React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);

  const dragState = useDragState();

  if (!isEditMode && !emails.length) return null;

  const newEmail = (): ContactEmail => ({ email: '', type: null, isPrimary: emails.length === 0 });
  const { rows, blankIndex, commit } = autoRows(emails, e => !e.email && !e.type, newEmail, onEmailsChange);


  const updateEmail = (index: number, field: keyof ContactEmail, value: string | boolean) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    commit(updated);
  };

  const removeEmail = (index: number) => commit(emails.filter((_, i) => i !== index));


  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Email</h4>
        <div className="section-content edit-section-content">
          {rows.map((email, i) => (
            <div key={`email-${i}`} className={renderItemSuffix ? 'edit-item-with-suffix' : undefined}>
              <DraggableArrayItem
                index={i}
                isBlankRow={i === blankIndex}
                draggedIndex={dragState.draggedIndex}
                dropZoneIndex={dragState.dropZoneIndex}
                onDragStart={dragState.handleDragStart}
                onDragEnd={dragState.handleDragEnd}
                onDragOver={dragState.handleDragOver}
                onDrop={(from, to) => dragState.handleDrop(from, to, emails, onEmailsChange || (() => {}))}
                onRemove={() => removeEmail(i)}
              >
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
              </DraggableArrayItem>
              {i !== blankIndex && renderItemSuffix?.(i)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const visible = showAll ? emails : emails.slice(0, initialLimit);
  const remaining = emails.length - initialLimit;

  return (
    <div className="expanded-section-view">
      <SectionHeading icon="envelope" label="Email" />
      {visible.map((email, i) => {
        const { icon, style } = getEmailIcon(email.email);
        const field = (
          <InfoField icon={icon} iconStyle={style} actions={<EmailActions email={email.email} />}>
            <CopyableValue value={email.email} />
          </InfoField>
        );
        return renderItemSuffix ? (
          <div key={`email-${i}`} className="view-item-with-suffix">
            {field}
            {renderItemSuffix(i)}
          </div>
        ) : (
          <React.Fragment key={`email-${i}`}>{field}</React.Fragment>
        );
      })}
      {!showAll && remaining > 0 && (
        <div className="show-more-link">
          <button className="show-more-button" onClick={() => setShowAll(true)}>
            Show {remaining} additional email{remaining !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── LocationsSection ────────────────────────────────────────────

export function LocationsSection({ addresses, isEditMode, onAddressesChange, renderItemSuffix }: {
  addresses: ContactAddress[];
  isEditMode: boolean;
  onAddressesChange?: (addresses: ContactAddress[]) => void;
  renderItemSuffix?: (index: number) => React.ReactNode;
}) {
  const dragState = useDragState();

  if (!isEditMode && !addresses.length) return null;

  const newAddress = (): ContactAddress => ({ street: null, city: null, state: null, postalCode: null, country: null, type: null });
  const { rows, blankIndex, commit } = autoRows(
    addresses,
    a => !a.street && !a.city && !a.state && !a.postalCode && !a.country && !a.type,
    newAddress,
    onAddressesChange,
  );


  const updateAddress = (index: number, field: keyof ContactAddress, value: string | null) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value || null };
    commit(updated);
  };

  const removeAddress = (index: number) => commit(addresses.filter((_, i) => i !== index));


  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Address</h4>
        <div className="section-content edit-section-content">
          {rows.map((addr, i) => (
            <div key={i} className={renderItemSuffix ? 'edit-item-with-suffix' : undefined}>
              <DraggableArrayItem
                index={i}
                isBlankRow={i === blankIndex}
                draggedIndex={dragState.draggedIndex}
                dropZoneIndex={dragState.dropZoneIndex}
                onDragStart={dragState.handleDragStart}
                onDragEnd={dragState.handleDragEnd}
                onDragOver={dragState.handleDragOver}
                onDrop={(from, to) => dragState.handleDrop(from, to, addresses, onAddressesChange || (() => {}))}
                onRemove={() => removeAddress(i)}
              >
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
              </DraggableArrayItem>
              {i !== blankIndex && renderItemSuffix?.(i)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section-view">
      <SectionHeading icon="location-dot" label="Address" />
      {addresses.map((addr, i) => {
        const lines = formatAddressLines(addr);
        if (lines.length === 1 && lines[0] === '(Empty address)') return null;

        const icon = addr.type?.toLowerCase() === 'home' ? 'house' :
                     addr.type?.toLowerCase() === 'work' ? 'building' : 'location-dot';

        const field = (
          <InfoField icon={icon}>
            <div className="address-lines">
              {lines.map((line, li) => (
                <span key={li}>{line}</span>
              ))}
            </div>
          </InfoField>
        );
        return renderItemSuffix ? (
          <div key={i} className="view-item-with-suffix">
            {field}
            {renderItemSuffix(i)}
          </div>
        ) : (
          <React.Fragment key={i}>{field}</React.Fragment>
        );
      })}
    </div>
  );
}

// ─── SocialLinksSection ──────────────────────────────────────────

export function SocialLinksSection({ socialProfiles, isEditMode, onSocialProfilesChange, renderItemSuffix }: {
  socialProfiles: ContactSocialProfile[];
  isEditMode: boolean;
  onSocialProfilesChange?: (profiles: ContactSocialProfile[]) => void;
  renderItemSuffix?: (index: number) => React.ReactNode;
}) {
  const dragState = useDragState();

  if (!isEditMode && !socialProfiles.length) return null;

  const newProfile = (): ContactSocialProfile => ({ id: 0, contactId: 0, platform: '', username: '', profileUrl: null, type: null });
  const { rows, blankIndex, commit } = autoRows(
    socialProfiles,
    p => !p.platform && !p.username && !p.profileUrl && !p.type,
    newProfile,
    onSocialProfilesChange,
  );


  const updateProfile = (index: number, field: keyof ContactSocialProfile, value: string | null) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    commit(updated);
  };

  // A recognised URL fills in platform and username. Either is only replaced while
  // it is empty or still what the previous URL implied, so a typed value is kept;
  // an unrecognised (or cleared) URL leaves both alone.
  const updateProfileUrl = (index: number, url: string) => {
    const current = rows[index];
    const before = detectSocialProfile(current.profileUrl ?? '');
    const after = detectSocialProfile(url);
    const tracksUrl = (value: string, implied: string | null | undefined) =>
      !value.trim() || value.trim().toLowerCase() === implied?.toLowerCase();

    const updated = [...rows];
    updated[index] = {
      ...current,
      profileUrl: url || null,
      platform: after && tracksUrl(current.platform, before?.platform) ? after.platform : current.platform,
      username: after && tracksUrl(current.username, before?.username) ? after.username ?? '' : current.username,
    };
    commit(updated);
  };

  const removeProfile = (index: number) => commit(socialProfiles.filter((_, i) => i !== index));


  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Social Links</h4>
        <div className="section-content edit-section-content">
          {rows.map((profile, i) => (
            <div key={i} className={renderItemSuffix ? 'edit-item-with-suffix' : undefined}>
              <DraggableArrayItem
                index={i}
                isBlankRow={i === blankIndex}
                draggedIndex={dragState.draggedIndex}
                dropZoneIndex={dragState.dropZoneIndex}
                onDragStart={dragState.handleDragStart}
                onDragEnd={dragState.handleDragEnd}
                onDragOver={dragState.handleDragOver}
                onDrop={(from, to) => dragState.handleDrop(from, to, socialProfiles, onSocialProfilesChange || (() => {}))}
                onRemove={() => removeProfile(i)}
              >
                <Icon name={getPlatformIcon(profile.platform)} style={getPlatformIconStyle(profile.platform)} />
                <div className="edit-field-group">
                  <EditableField
                    value={profile.profileUrl || ''}
                    onChange={(v) => updateProfileUrl(i, v)}
                    placeholder="Profile URL"
                    type="url"
                  />
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
                </div>
              </DraggableArrayItem>
              {i !== blankIndex && renderItemSuffix?.(i)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section-view">
      <SectionHeading icon="share-nodes" label="Social Links" />
      {socialProfiles.map((profile, i) => {
        const field = (
          <InfoField icon={getPlatformIcon(profile.platform)} iconStyle={getPlatformIconStyle(profile.platform)}>
            {profile.profileUrl ? (
              <a href={profile.profileUrl} target="_blank" rel="noopener noreferrer">
                {profile.username || profile.platform}
              </a>
            ) : (
              <span>{profile.username}</span>
            )}
          </InfoField>
        );
        return renderItemSuffix ? (
          <div key={profile.id} className="view-item-with-suffix">
            {field}
            {renderItemSuffix(i)}
          </div>
        ) : (
          <React.Fragment key={profile.id}>{field}</React.Fragment>
        );
      })}
    </div>
  );
}

// ─── BirthdaySection ─────────────────────────────────────────────

export function BirthdaySection({ birthday, isEditMode, onBirthdayChange, renderSuffix }: {
  birthday: string | null;
  isEditMode: boolean;
  onBirthdayChange?: (birthday: string | null) => void;
  renderSuffix?: () => React.ReactNode;
}) {
  if (!isEditMode && !birthday) return null;

  const zodiacSign = birthday ? getZodiacSign(birthday) : null;

  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Birthday</h4>
        <div className="section-content edit-section-content">
          <div className={renderSuffix ? 'edit-item-with-suffix' : undefined}>
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
            {renderSuffix?.()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section-view">
      <SectionHeading icon="cake-candles" label="Birthday" zodiacSign={zodiacSign} />
      {renderSuffix ? (
        <div className="view-item-with-suffix">
          <InfoField icon="cake-candles">
            <span>{formatBirthday(birthday!)}</span>
          </InfoField>
          {renderSuffix()}
        </div>
      ) : (
        <InfoField icon="cake-candles">
          <span>{formatBirthday(birthday!)}</span>
        </InfoField>
      )}
    </div>
  );
}

// ─── CategoriesSection ───────────────────────────────────────────

export function CategoriesSection({ categories, isEditMode, onCategoriesChange, renderItemSuffix }: {
  categories: ContactCategory[];
  isEditMode: boolean;
  onCategoriesChange?: (categories: ContactCategory[]) => void;
  renderItemSuffix?: (index: number) => React.ReactNode;
}) {
  const dragState = useDragState();

  if (!isEditMode && !categories.length) return null;

  const newCategory = (): ContactCategory => ({ id: 0, contactId: 0, category: '' });
  const { rows, blankIndex, commit } = autoRows(categories, c => !c.category, newCategory, onCategoriesChange);


  const updateCategory = (index: number, value: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], category: value };
    commit(updated);
  };

  const removeCategory = (index: number) => commit(categories.filter((_, i) => i !== index));


  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Categories</h4>
        <div className="section-content edit-section-content">
          {rows.map((cat, i) => (
            <div key={i} className={renderItemSuffix ? 'edit-item-with-suffix' : undefined}>
              <DraggableArrayItem
                index={i}
                isBlankRow={i === blankIndex}
                draggedIndex={dragState.draggedIndex}
                dropZoneIndex={dragState.dropZoneIndex}
                onDragStart={dragState.handleDragStart}
                onDragEnd={dragState.handleDragEnd}
                onDragOver={dragState.handleDragOver}
                onDrop={(from, to) => dragState.handleDrop(from, to, categories, onCategoriesChange || (() => {}))}
                onRemove={() => removeCategory(i)}
              >
                <EditableField
                  value={cat.category}
                  onChange={(v) => updateCategory(i, v)}
                  placeholder="Category name"
                />
              </DraggableArrayItem>
              {i !== blankIndex && renderItemSuffix?.(i)}
            </div>
          ))}
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

// ─── InstantMessagesSection ──────────────────────────────────────

export function InstantMessagesSection({ instantMessages, isEditMode, onInstantMessagesChange, renderItemSuffix }: {
  instantMessages: ContactInstantMessage[];
  isEditMode: boolean;
  onInstantMessagesChange?: (messages: ContactInstantMessage[]) => void;
  renderItemSuffix?: (index: number) => React.ReactNode;
}) {
  const dragState = useDragState();

  if (!isEditMode && !instantMessages.length) return null;

  const newIM = (): ContactInstantMessage => ({ id: 0, contactId: 0, service: '', handle: '', type: null });
  const { rows, blankIndex, commit } = autoRows(
    instantMessages, im => !im.service && !im.handle && !im.type, newIM, onInstantMessagesChange,
  );


  const updateIM = (index: number, field: keyof ContactInstantMessage, value: string | null) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    commit(updated);
  };

  const removeIM = (index: number) => commit(instantMessages.filter((_, i) => i !== index));


  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Instant Messages</h4>
        <div className="section-content edit-section-content">
          {rows.map((im, i) => (
            <div key={i} className={renderItemSuffix ? 'edit-item-with-suffix' : undefined}>
              <DraggableArrayItem
                index={i}
                isBlankRow={i === blankIndex}
                draggedIndex={dragState.draggedIndex}
                dropZoneIndex={dragState.dropZoneIndex}
                onDragStart={dragState.handleDragStart}
                onDragEnd={dragState.handleDragEnd}
                onDragOver={dragState.handleDragOver}
                onDrop={(from, to) => dragState.handleDrop(from, to, instantMessages, onInstantMessagesChange || (() => {}))}
                onRemove={() => removeIM(i)}
              >
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
              </DraggableArrayItem>
              {i !== blankIndex && renderItemSuffix?.(i)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section-view">
      <SectionHeading icon="message" label="Instant Messages" />
      {instantMessages.map((im) => (
        <InfoField key={im.id} icon={getServiceIcon(im.service)}>
          <span>{im.handle}</span>
        </InfoField>
      ))}
    </div>
  );
}

// ─── UrlsSection ─────────────────────────────────────────────────

export function UrlsSection({ urls, isEditMode, onUrlsChange, renderItemSuffix }: {
  urls: ContactUrl[];
  isEditMode: boolean;
  onUrlsChange?: (urls: ContactUrl[]) => void;
  renderItemSuffix?: (index: number) => React.ReactNode;
}) {
  const dragState = useDragState();

  if (!isEditMode && !urls.length) return null;

  const newUrl = (): ContactUrl => ({ id: 0, contactId: 0, url: '', label: null, type: null });
  const { rows, blankIndex, commit } = autoRows(urls, u => !u.url && !u.label && !u.type, newUrl, onUrlsChange);


  const updateUrl = (index: number, field: keyof ContactUrl, value: string | null) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    commit(updated);
  };

  const removeUrl = (index: number) => commit(urls.filter((_, i) => i !== index));


  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Web Links</h4>
        <div className="section-content edit-section-content">
          {rows.map((u, i) => (
            <div key={i} className={renderItemSuffix ? 'edit-item-with-suffix' : undefined}>
              <DraggableArrayItem
                index={i}
                isBlankRow={i === blankIndex}
                draggedIndex={dragState.draggedIndex}
                dropZoneIndex={dragState.dropZoneIndex}
                onDragStart={dragState.handleDragStart}
                onDragEnd={dragState.handleDragEnd}
                onDragOver={dragState.handleDragOver}
                onDrop={(from, to) => dragState.handleDrop(from, to, urls, onUrlsChange || (() => {}))}
                onRemove={() => removeUrl(i)}
              >
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
              </DraggableArrayItem>
              {i !== blankIndex && renderItemSuffix?.(i)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section-view">
      <SectionHeading icon="link" label="Web Links" />
      {urls.map((u, i) => {
        const field = (
          <InfoField icon={getUrlIcon(u.url, u.label)}>
            <a href={u.url} target="_blank" rel="noopener noreferrer">
              {getDisplayLabel(u.url, u.label)}
            </a>
          </InfoField>
        );
        return renderItemSuffix ? (
          <div key={u.id} className="view-item-with-suffix">
            {field}
            {renderItemSuffix(i)}
          </div>
        ) : (
          <React.Fragment key={u.id}>{field}</React.Fragment>
        );
      })}
    </div>
  );
}

// ─── RelatedPeopleSection ────────────────────────────────────────

export function RelatedPeopleSection({ relatedPeople, linkedFrom, isEditMode, onRelatedPeopleChange, renderItemSuffix, excludeContactId }: {
  relatedPeople: ContactRelatedPerson[];
  linkedFrom?: LinkedFromEntry[];
  isEditMode: boolean;
  onRelatedPeopleChange?: (people: ContactRelatedPerson[]) => void;
  renderItemSuffix?: (index: number) => React.ReactNode;
  excludeContactId?: number;
}) {
  const dragState = useDragState();
  const reverseLinks = linkedFrom ?? [];
  if (!isEditMode && !relatedPeople.length && !reverseLinks.length) return null;

  const newPerson = (): ContactRelatedPerson => ({ id: 0, contactId: 0, name: '', relationship: null, relatedContactId: null });
  const { rows, blankIndex, commit } = autoRows(
    relatedPeople,
    p => !p.name && !p.relationship && p.relatedContactId == null,
    newPerson,
    onRelatedPeopleChange,
  );


  const updatePerson = (index: number, field: keyof ContactRelatedPerson, value: string | null) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    commit(updated);
  };

  // Linking must set the name and target id together in one state update.
  const linkPerson = (index: number, contact: ContactSearchResult) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], name: contact.displayName, relatedContactId: contact.id };
    commit(updated);
  };

  const unlinkPerson = (index: number) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], relatedContactId: null };
    commit(updated);
  };

  const removePerson = (index: number) => commit(relatedPeople.filter((_, i) => i !== index));


  if (isEditMode) {
    return (
      <div className="expanded-section">
        <h4 className="section-header">Related People</h4>
        <div className="section-content edit-section-content">
          {rows.map((person, i) => (
            <div key={i} className={renderItemSuffix ? 'edit-item-with-suffix' : undefined}>
              <DraggableArrayItem
                index={i}
                isBlankRow={i === blankIndex}
                draggedIndex={dragState.draggedIndex}
                dropZoneIndex={dragState.dropZoneIndex}
                onDragStart={dragState.handleDragStart}
                onDragEnd={dragState.handleDragEnd}
                onDragOver={dragState.handleDragOver}
                onDrop={(from, to) => dragState.handleDrop(from, to, relatedPeople, onRelatedPeopleChange || (() => {}))}
                onRemove={() => removePerson(i)}
              >
                <Icon name={getRelationshipIcon(person.relationship)} />
                <div className="edit-field-group">
                  <RelatedPersonNameField
                    name={person.name}
                    relatedContactId={person.relatedContactId}
                    excludeContactId={excludeContactId}
                    onNameChange={(v) => updatePerson(i, 'name', v)}
                    onLink={(contact) => linkPerson(i, contact)}
                    onUnlink={() => unlinkPerson(i)}
                  />
                  <EditableField
                    value={person.relationship || ''}
                    onChange={(v) => updatePerson(i, 'relationship', v || null)}
                    placeholder="Relationship"
                  />
                </div>
              </DraggableArrayItem>
              {i !== blankIndex && renderItemSuffix?.(i)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section-view">
      <SectionHeading icon="user" label="Related" />
      {relatedPeople.map((person) => (
        <InfoField key={person.id} icon={getRelationshipIcon(person.relationship)}>
          {person.relatedContactId != null ? (
            <Link to={`/contacts/${person.relatedContactId}`}>{person.name}</Link>
          ) : (
            <span>{person.name}</span>
          )}
        </InfoField>
      ))}
      {reverseLinks.map((entry) => (
        <InfoField key={`from-${entry.contactId}`} icon={getRelationshipIcon(entry.relationship)}>
          <Link to={`/contacts/${entry.contactId}`}>{entry.displayName}</Link>
        </InfoField>
      ))}
    </div>
  );
}

// ─── NotesSection ────────────────────────────────────────────────

export function NotesSection({ notes, isEditMode, onNotesChange, renderSuffix }: {
  notes: string | null;
  isEditMode: boolean;
  onNotesChange?: (notes: string | null) => void;
  renderSuffix?: () => React.ReactNode;
}) {
  if (!isEditMode && !notes) return null;

  if (isEditMode) {
    return (
      <div>
        <h4 className="section-header">Notes</h4>
        <div className={renderSuffix ? 'edit-item-with-suffix' : undefined}>
          <textarea
            value={notes || ''}
            onChange={(e) => onNotesChange?.(e.target.value || null)}
            placeholder="Add notes..."
            className="edit-notes-textarea"
            rows={4}
          />
          {renderSuffix?.()}
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section-view">
      <SectionHeading icon="pencil" label="Notes" />
      <div className="notes-field">{notes}</div>
    </div>
  );
}

// ─── LinkedInSection (read-only, displays enrichment data) ───────

export function LinkedInSection({ enrichment, contactPhotoUrl }: { enrichment: LinkedInEnrichment; contactPhotoUrl?: string | null }) {
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

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
        {showLinkedInPhoto && (
          <div className="linkedin-profile-photo">
            <img
              src={enrichment.photoLinkedin!}
              alt="LinkedIn profile"
              className="linkedin-avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {enrichment.headline && (
          <div className="linkedin-headline">{enrichment.headline}</div>
        )}

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

        {enrichment.about && (
          <div className="linkedin-about">
            <details>
              <summary>About</summary>
              <p>{enrichment.about}</p>
            </details>
          </div>
        )}

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

        {enrichment.positions && enrichment.positions.length > 0 && (
          <div className="expanded-item">
            <Icon name="briefcase" />
            <div className="expanded-item-content">
              <ul className="education-list">
                {enrichment.positions.map((pos, i) => (
                  <li key={i}>
                    <span>{pos.title}{pos.companyName ? ` at ${pos.companyName}` : ''}</span>
                    {(pos.startDate || pos.endDate) && (
                      <span className="item-type"> ({pos.startDate || '?'} – {pos.endDate || 'Present'})</span>
                    )}
                    {pos.locationName && (
                      <div className="linkedin-sub-detail">{pos.locationName}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

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

        {enrichment.certifications && enrichment.certifications.length > 0 && (
          <div className="expanded-item">
            <Icon name="certificate" />
            <div className="expanded-item-content">
              <ul className="education-list">
                {enrichment.certifications.map((cert, i) => (
                  <li key={i}>{cert.name}{cert.authority ? ` — ${cert.authority}` : ''}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {enrichment.languages && enrichment.languages.length > 0 && (
          <div className="expanded-item">
            <Icon name="globe" />
            <div className="expanded-item-content skills-list">
              {enrichment.languages.map((lang, i) => (
                <span key={i} className="skill-tag">
                  {lang.name}{lang.proficiency ? ` (${lang.proficiency})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {enrichment.honors && enrichment.honors.length > 0 && (
          <div className="expanded-item">
            <Icon name="star" />
            <div className="expanded-item-content">
              <ul className="education-list">
                {enrichment.honors.map((honor, i) => (
                  <li key={i}>{honor.title}{honor.issuer ? ` — ${honor.issuer}` : ''}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {enrichment.followersCount !== null && enrichment.followersCount > 0 && (
          <div className="expanded-item">
            <Icon name="users" />
            <div className="expanded-item-content">
              <span>{enrichment.followersCount.toLocaleString()} followers</span>
            </div>
          </div>
        )}

        <div className="linkedin-footer">
          <Icon name="clock-rotate-left" />
          <span>Enriched from LinkedIn {formatDate(enrichment.enrichedAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Shared type export ──────────────────────────────────────────

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
