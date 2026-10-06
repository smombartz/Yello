import { useState } from 'react';
import type { ContactDetail, ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson, UpdateContactRequest } from '../api/types';
import { useUpdateContact } from '../api/hooks';
import { Button } from './ui/Button';
import { EditableField, LinkedInSection, SaveErrors } from './ContactFormSections';
import { ContactCardView } from './ContactCardView';
import { EmailHistorySection } from './EmailHistorySection';
import { ContactPhotoGallery } from './ContactPhotoGallery';
import { useCopyLink } from '../hooks/useCopyLink';
import { buildContactLists } from '../utils/contactPayload';

interface ContactRowExpandedProps {
  contact: ContactDetail;
  /** Increment to open the edit form from outside (the card's menu). Ignored while already editing. */
  editRequest?: number;
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

export function ContactRowExpanded({ contact, editRequest = 0 }: ContactRowExpandedProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Once a save has been refused, the problem list re-checks as the form is edited.
  const [showProblems, setShowProblems] = useState(false);
  const problems = showProblems && editForm ? buildContactLists(editForm).problems : [];
  const [handledEditRequest, setHandledEditRequest] = useState(0);
  const updateContactMutation = useUpdateContact();
  const copyLink = useCopyLink();

  // The URL already points at this contact (?contact= in a list, /contacts/:id on
  // the detail page). Copying it here also covers the desktop app, which has no address bar.
  const handleCopyLink = () => copyLink(window.location.href);

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
    setShowProblems(false);
  };

  // Adjusted during render rather than in an effect, so the form opens in the same pass
  if (editRequest !== handledEditRequest) {
    setHandledEditRequest(editRequest);
    if (editRequest > 0 && !isEditMode) handleEnterEditMode();
  }

  const handleCancel = () => {
    setIsEditMode(false);
    setEditForm(null);
    setError(null);
    setShowProblems(false);
  };

  const handleSave = async () => {
    if (!editForm) return;

    setError(null);

    // Each list is replaced wholesale on save, so a row left out here would be deleted.
    const { lists, problems } = buildContactLists(editForm);
    if (problems.length) {
      setShowProblems(true);
      return;
    }

    const updateData: UpdateContactRequest = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      company: editForm.company,
      title: editForm.title,
      notes: editForm.notes,
      birthday: editForm.birthday,
      ...lists,
    };

    try {
      await updateContactMutation.mutateAsync({ id: contact.id, data: updateData });
      setIsEditMode(false);
      setEditForm(null);
      setShowProblems(false);
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
            <Button
              variant="secondary"
              onClick={handleCancel}
              disabled={updateContactMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="floppy-disk"
              loading={updateContactMutation.isPending}
              onClick={handleSave}
              disabled={updateContactMutation.isPending}
            >
              {updateContactMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        <SaveErrors message={error} problems={problems} />

        <ContactCardView
          data={contact}
          contactId={contact.id}
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
          linkedFrom: contact.linkedFrom,
          birthday: contact.birthday,
          notes: contact.notes,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        }}
      >
        {contact.linkedinEnrichment && (
          <LinkedInSection enrichment={contact.linkedinEnrichment} contactPhotoUrl={contact.photoUrl} />
        )}
        <EmailHistorySection contactId={contact.id} hasEmails={contact.emails.length > 0} />
      </ContactCardView>

      {/* Photo gallery for multi-source photos */}
      {contact.photos && contact.photos.length > 1 && (
        <ContactPhotoGallery contactId={contact.id} photos={contact.photos} />
      )}

      {/* Bottom: Copy link + Edit, right-aligned */}
      <div className="expanded-bottom-actions">
        <Button variant="secondary" icon="link" onClick={handleCopyLink}>
          Copy link
        </Button>
        <Button variant="primary" onClick={handleEnterEditMode}>
          Edit
        </Button>
      </div>
    </div>
  );
}
