import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContactDetail, ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson, UpdateContactRequest } from '../api/types';
import { useUpdateContact } from '../api/hooks';
import { useDeleteContacts } from '../api/cleanupHooks';
import { useSyncStatus } from '../api/syncHooks';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { EditableField, LinkedInSection, ReachOutBar, SaveErrors } from './ContactFormSections';
import { ContactCardView } from './ContactCardView';
import { EmailHistorySection } from './EmailHistorySection';
import { ContactPhotoGallery } from './ContactPhotoGallery';
import { useCopyLink } from '../hooks/useCopyLink';
import { buildContactLists } from '../utils/contactPayload';

interface ContactRowExpandedProps {
  contact: ContactDetail;
  /** Increment to open the edit form from outside (the card's menu). Ignored while already editing. */
  editRequest?: number;
  /** Called once the contact has been deleted, so the host can collapse the row or leave the page. */
  onDeleted?: () => void;
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

/** Names the synced address books the delete will also reach, so the warning is specific. */
function DeleteContactDialog({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  const { data } = useSyncStatus();
  const synced = (data?.providers ?? [])
    .filter(p => p.enabled)
    .map(p => (p.provider === 'icloud' ? 'iCloud' : 'Google Contacts'));
  return (
    <ConfirmDialog
      title={`Delete ${name}?`}
      message={
        synced.length
          ? `This can't be undone. ${name} is also deleted from ${synced.join(' and ')}. To keep it out of your list without deleting it, archive it instead.`
          : `This can't be undone. To keep it out of your list without deleting it, archive it instead.`
      }
      confirmLabel="Delete"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export function ContactRowExpanded({ contact, editRequest = 0, onDeleted }: ContactRowExpandedProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Once a save has been refused, the problem list re-checks as the form is edited.
  const [showProblems, setShowProblems] = useState(false);
  const problems = showProblems && editForm ? buildContactLists(editForm).problems : [];
  const [handledEditRequest, setHandledEditRequest] = useState(0);
  const updateContactMutation = useUpdateContact();
  const deleteContactMutation = useDeleteContacts();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { showToast } = useToast();
  const copyLink = useCopyLink();
  const isBusy = updateContactMutation.isPending || deleteContactMutation.isPending;
  const editContentRef = useRef<HTMLDivElement>(null);

  // Edit sits at the bottom of the card, and the edit form is often shorter than the view
  // it replaces (no LinkedIn, email history or photos), so the page can be left scrolled
  // past the form's top. The sticky name row is then held at the bottom of the card.
  // Bring the card's top back into view whenever the form opens above the viewport.
  useEffect(() => {
    if (!isEditMode) return;
    const content = editContentRef.current;
    if (!content) return;
    const target = content.closest<HTMLElement>('.contact-card') ?? content;
    const offset = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    if (target.getBoundingClientRect().top < offset) target.scrollIntoView({ block: 'start' });
  }, [isEditMode]);

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

  const handleDelete = () => {
    setShowDeleteConfirm(false);
    deleteContactMutation.mutate([contact.id], {
      onSuccess: () => {
        showToast(`Deleted ${contact.displayName}`);
        onDeleted?.();
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete contact'),
    });
  };

  // ─── Edit Mode ───────────────────────────────────────────────
  if (isEditMode && editForm) {
    return (
      <div className="expanded-content" ref={editContentRef} onClick={(e) => e.stopPropagation()}>
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
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="floppy-disk"
              loading={updateContactMutation.isPending}
              onClick={handleSave}
              disabled={isBusy}
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

        {/* Bottom: Delete, only in edit mode. Save/Cancel stay pinned at the top. */}
        <div className="expanded-bottom-actions expanded-delete-row">
          <Button
            variant="danger"
            icon="trash-can"
            loading={deleteContactMutation.isPending}
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isBusy}
          >
            {deleteContactMutation.isPending ? 'Deleting...' : 'Delete contact'}
          </Button>
        </div>

        {/* Portaled: the list row is transformed and clipped, which would trap a fixed overlay */}
        {showDeleteConfirm && createPortal(
          <DeleteContactDialog
            name={contact.displayName || 'this contact'}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />,
          document.body
        )}
      </div>
    );
  }

  // ─── View Mode (Figma layout) ────────────────────────────────
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ReachOutBar phones={contact.phones} emails={contact.emails} />
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
        contactId={contact.id}
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
