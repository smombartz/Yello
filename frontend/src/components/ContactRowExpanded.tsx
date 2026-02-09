import { useState } from 'react';
import type { ContactDetail, ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson, UpdateContactRequest } from '../api/types';
import { useUpdateContact } from '../api/hooks';
import { Icon } from './Icon';
import {
  EditableField,
  ContactInfoSection,
  LocationsSection,
  SocialLinksSection,
  BirthdaySection,
  CategoriesSection,
  InstantMessagesSection,
  UrlsSection,
  RelatedPeopleSection,
  NotesSection,
  LinkedInSection
} from './ContactFormSections';

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

// Edit form state interface
interface EditFormState {
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

export function ContactRowExpanded({ contact }: ContactRowExpandedProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateContactMutation = useUpdateContact();

  const handleEnterEditMode = () => {
    setEditForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      title: contact.title,
      notes: contact.notes,
      birthday: contact.birthday,
      emails: [...contact.emails],
      phones: [...contact.phones],
      addresses: [...contact.addresses],
      socialProfiles: [...contact.socialProfiles],
      categories: [...contact.categories],
      instantMessages: [...contact.instantMessages],
      urls: [...contact.urls],
      relatedPeople: [...contact.relatedPeople],
    });
    setIsEditMode(true);
    setError(null);
  };

  const handleCancel = () => {
    setIsEditMode(false);
    setEditForm(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!editForm) return;

    setError(null);

    // Build the update request
    const updateData: UpdateContactRequest = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      company: editForm.company,
      title: editForm.title,
      notes: editForm.notes,
      birthday: editForm.birthday,
      emails: editForm.emails.filter(e => e.email.trim()).map(e => ({
        email: e.email,
        type: e.type,
        isPrimary: e.isPrimary,
      })),
      phones: editForm.phones.filter(p => p.phone.trim()).map(p => ({
        phone: p.phone,
        phoneDisplay: p.phoneDisplay,
        countryCode: p.countryCode,
        type: p.type,
        isPrimary: p.isPrimary,
      })),
      addresses: editForm.addresses.filter(a =>
        a.street || a.city || a.state || a.postalCode || a.country
      ).map(a => ({
        street: a.street,
        city: a.city,
        state: a.state,
        postalCode: a.postalCode,
        country: a.country,
        type: a.type,
      })),
      socialProfiles: editForm.socialProfiles.filter(s => s.platform.trim() && s.username.trim()).map(s => ({
        platform: s.platform,
        username: s.username,
        profileUrl: s.profileUrl,
        type: s.type,
      })),
      categories: editForm.categories.filter(c => c.category.trim()).map(c => ({
        category: c.category,
      })),
      instantMessages: editForm.instantMessages.filter(im => im.service.trim() && im.handle.trim()).map(im => ({
        service: im.service,
        handle: im.handle,
        type: im.type,
      })),
      urls: editForm.urls.filter(u => u.url.trim()).map(u => ({
        url: u.url,
        label: u.label,
        type: u.type,
      })),
      relatedPeople: editForm.relatedPeople.filter(rp => rp.name.trim()).map(rp => ({
        name: rp.name,
        relationship: rp.relationship,
      })),
    };

    try {
      await updateContactMutation.mutateAsync({ id: contact.id, data: updateData });
      setIsEditMode(false);
      setEditForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  const hasContactInfo = contact.emails.length > 0 || contact.phones.length > 0;
  const hasLocations = contact.addresses.length > 0;
  const hasSocial = contact.socialProfiles.length > 0;
  const hasCategories = contact.categories?.length > 0;
  const hasInstantMessages = contact.instantMessages?.length > 0;
  const hasUrls = contact.urls?.length > 0;
  const hasRelatedPeople = contact.relatedPeople?.length > 0;
  const hasBirthday = !!contact.birthday;
  const hasLinkedIn = !!contact.linkedinEnrichment;

  // Use edit form data when in edit mode
  const displayData = isEditMode && editForm ? {
    ...contact,
    ...editForm,
  } : contact;

  return (
    <div className="expanded-content" onClick={(e) => e.stopPropagation()}>
      {/* Title + Quick Actions row */}
      <div className="expanded-top-row">
        {isEditMode ? (
          <div className="edit-name-fields">
            <EditableField
              value={editForm?.firstName || ''}
              onChange={(v) => setEditForm(f => f ? { ...f, firstName: v || null } : null)}
              placeholder="First name"
            />
            <EditableField
              value={editForm?.lastName || ''}
              onChange={(v) => setEditForm(f => f ? { ...f, lastName: v || null } : null)}
              placeholder="Last name"
            />
            <EditableField
              value={editForm?.company || ''}
              onChange={(v) => setEditForm(f => f ? { ...f, company: v || null } : null)}
              placeholder="Company"
            />
            <EditableField
              value={editForm?.title || ''}
              onChange={(v) => setEditForm(f => f ? { ...f, title: v || null } : null)}
              placeholder="Title"
            />
          </div>
        ) : (
          contact.title && <p className="expanded-title">{contact.title}</p>
        )}
        <div className="expanded-actions">
          {isEditMode ? (
            <>
              <button
                className="action-button secondary"
                onClick={handleCancel}
                disabled={updateContactMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="action-button primary"
                onClick={handleSave}
                disabled={updateContactMutation.isPending}
              >
                {updateContactMutation.isPending ? (
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
            </>
          ) : (
            <button className="action-button" onClick={handleEnterEditMode}>
              <Icon name="pen-to-square" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="edit-error">
          <Icon name="circle-exclamation" />
          {error}
        </div>
      )}

      {/* Categories row */}
      {(hasCategories || isEditMode) && (
        <CategoriesSection
          categories={displayData.categories}
          isEditMode={isEditMode}
          onCategoriesChange={(categories) => setEditForm(f => f ? { ...f, categories } : null)}
        />
      )}

      {/* Main content grid */}
      <div className="expanded-grid">
        {/* Left column: Contact Info + Instant Messages */}
        <div className="expanded-column">
          {(hasContactInfo || isEditMode) && (
            <ContactInfoSection
              emails={displayData.emails}
              phones={displayData.phones}
              isEditMode={isEditMode}
              onEmailsChange={(emails) => setEditForm(f => f ? { ...f, emails } : null)}
              onPhonesChange={(phones) => setEditForm(f => f ? { ...f, phones } : null)}
            />
          )}
          {(hasInstantMessages || isEditMode) && (
            <InstantMessagesSection
              instantMessages={displayData.instantMessages}
              isEditMode={isEditMode}
              onInstantMessagesChange={(instantMessages) => setEditForm(f => f ? { ...f, instantMessages } : null)}
            />
          )}
        </div>

        {/* Center column: Locations + Birthday + Related People */}
        <div className="expanded-column">
          {(hasLocations || isEditMode) && (
            <LocationsSection
              addresses={displayData.addresses}
              isEditMode={isEditMode}
              onAddressesChange={(addresses) => setEditForm(f => f ? { ...f, addresses } : null)}
            />
          )}
          {(hasBirthday || isEditMode) && (
            <BirthdaySection
              birthday={displayData.birthday}
              isEditMode={isEditMode}
              onBirthdayChange={(birthday) => setEditForm(f => f ? { ...f, birthday } : null)}
            />
          )}
          {(hasRelatedPeople || isEditMode) && (
            <RelatedPeopleSection
              relatedPeople={displayData.relatedPeople}
              isEditMode={isEditMode}
              onRelatedPeopleChange={(relatedPeople) => setEditForm(f => f ? { ...f, relatedPeople } : null)}
            />
          )}
        </div>

        {/* Right column: LinkedIn + Social + URLs + Metadata */}
        <div className="expanded-column">
          {hasLinkedIn && !isEditMode && (
            <LinkedInSection enrichment={contact.linkedinEnrichment!} contactPhotoUrl={contact.photoUrl} />
          )}
          {(hasSocial || isEditMode) && (
            <SocialLinksSection
              socialProfiles={displayData.socialProfiles}
              isEditMode={isEditMode}
              onSocialProfilesChange={(socialProfiles) => setEditForm(f => f ? { ...f, socialProfiles } : null)}
            />
          )}
          {(hasUrls || isEditMode) && (
            <UrlsSection
              urls={displayData.urls}
              isEditMode={isEditMode}
              onUrlsChange={(urls) => setEditForm(f => f ? { ...f, urls } : null)}
            />
          )}
          <MetadataSection createdAt={contact.createdAt} updatedAt={contact.updatedAt} />
        </div>
      </div>

      {/* Notes section */}
      {(contact.notes || isEditMode) && (
        <div className="expanded-notes-row">
          <NotesSection
            notes={displayData.notes}
            isEditMode={isEditMode}
            onNotesChange={(notes) => setEditForm(f => f ? { ...f, notes } : null)}
          />
        </div>
      )}
    </div>
  );
}
