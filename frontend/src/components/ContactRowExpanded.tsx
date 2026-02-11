import { useState } from 'react';
import type { ContactDetail, ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson, UpdateContactRequest } from '../api/types';
import { useUpdateContact } from '../api/hooks';
import { Icon } from './Icon';
import { EditableField } from './ContactFormSections';
import { ContactCardView } from './ContactCardView';
import { EmailHistorySection } from './EmailHistorySection';

interface ContactRowExpandedProps {
  contact: ContactDetail;
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

  // ─── Edit Mode ───────────────────────────────────────────────
  if (isEditMode && editForm) {
    return (
      <div className="expanded-content" onClick={(e) => e.stopPropagation()}>
        {/* Name fields + Save/Cancel */}
        <div className="expanded-top-row">
          <div className="edit-name-fields">
            <EditableField
              value={editForm.firstName || ''}
              onChange={(v) => setEditForm(f => f ? { ...f, firstName: v || null } : null)}
              placeholder="First name"
            />
            <EditableField
              value={editForm.lastName || ''}
              onChange={(v) => setEditForm(f => f ? { ...f, lastName: v || null } : null)}
              placeholder="Last name"
            />
            <EditableField
              value={editForm.company || ''}
              onChange={(v) => setEditForm(f => f ? { ...f, company: v || null } : null)}
              placeholder="Company"
            />
            <EditableField
              value={editForm.title || ''}
              onChange={(v) => setEditForm(f => f ? { ...f, title: v || null } : null)}
              placeholder="Title"
            />
          </div>
          <div className="expanded-actions">
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
          </div>
        </div>

        {error && (
          <div className="edit-error">
            <Icon name="circle-exclamation" />
            {error}
          </div>
        )}

        <ContactCardView
          data={contact}
          isEditMode={true}
          editState={{
            phones: editForm.phones,
            emails: editForm.emails,
            addresses: editForm.addresses,
            socialProfiles: editForm.socialProfiles,
            categories: editForm.categories,
            instantMessages: editForm.instantMessages,
            urls: editForm.urls,
            relatedPeople: editForm.relatedPeople,
            birthday: editForm.birthday,
            notes: editForm.notes,
          }}
          onEditStateChange={(key, value) => {
            setEditForm(f => f ? { ...f, [key]: value } : null);
          }}
          showMetadata={false}
        />
      </div>
    );
  }

  // ─── View Mode (Figma layout) ────────────────────────────────
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ContactCardView
        data={{
          phones: contact.phones,
          emails: contact.emails,
          addresses: contact.addresses,
          socialProfiles: contact.socialProfiles,
          urls: contact.urls,
          relatedPeople: contact.relatedPeople,
          birthday: contact.birthday,
          notes: contact.notes,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        }}
      >
        <EmailHistorySection contactId={contact.id} hasEmails={contact.emails.length > 0} />
      </ContactCardView>

      {/* Bottom: Edit button right-aligned */}
      <div className="expanded-bottom-actions">
        <button className="edit-button-primary" onClick={handleEnterEditMode}>
          Edit
        </button>
      </div>
    </div>
  );
}
