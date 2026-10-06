import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson, CreateContactRequest } from '../api/types';
import { useCreateContact } from '../api/hooks';
import { buildContactLists } from '../utils/contactPayload';
import { Button } from './ui/Button';
import type { OutletContext } from './Layout';
import {
  EditableField,
  PhoneSection,
  EmailSection,
  LocationsSection,
  SocialLinksSection,
  BirthdaySection,
  CategoriesSection,
  InstantMessagesSection,
  UrlsSection,
  RelatedPeopleSection,
  NotesSection,
  SaveErrors
} from './ContactFormSections';

interface FormState {
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

const initialFormState: FormState = {
  firstName: null,
  lastName: null,
  company: null,
  title: null,
  notes: null,
  birthday: null,
  emails: [],
  phones: [],
  addresses: [],
  socialProfiles: [],
  categories: [],
  instantMessages: [],
  urls: [],
  relatedPeople: [],
};

/** The payload, plus everything that stops it being saved. */
function validate(form: FormState) {
  // Display name: first/last name, or the company
  const displayName = ([form.firstName, form.lastName].filter(Boolean).join(' ') || form.company || '').trim();
  const { lists, problems } = buildContactLists(form);
  if (!displayName) problems.unshift('The contact needs a first name, last name or company.');
  return { displayName, lists, problems };
}

export function AddContactPage() {
  const navigate = useNavigate();
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  // Destructured: the mutation object is new every render, and depending on it made the
  // header effect below re-run forever (setHeaderConfig re-renders this page via Layout).
  const { mutateAsync: createContact, isPending } = useCreateContact();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  // Once a save has been refused, the problem list re-checks as the form is edited.
  const [showProblems, setShowProblems] = useState(false);
  const problems = showProblems ? validate(form).problems : [];
  // Save sits in the header, so bring a failure into view wherever the page is scrolled.
  const errorRef = useRef<HTMLDivElement>(null);
  const [failedSaves, setFailedSaves] = useState(0);

  useEffect(() => {
    if (failedSaves) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [failedSaves]);

  const handleCancel = useCallback(() => {
    navigate('/contacts');
  }, [navigate]);

  const handleSave = useCallback(async () => {
    setError(null);

    const { displayName, lists, problems } = validate(form);
    if (problems.length) {
      setShowProblems(true);
      setFailedSaves(n => n + 1);
      return;
    }

    const createData: CreateContactRequest = {
      firstName: form.firstName,
      lastName: form.lastName,
      displayName,
      company: form.company,
      title: form.title,
      notes: form.notes,
      birthday: form.birthday,
      ...lists,
    };

    try {
      await createContact(createData);
      navigate('/contacts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contact');
      setFailedSaves(n => n + 1);
    }
  }, [form, createContact, navigate]);

  useEffect(() => {
    setHeaderConfig({
      title: 'New Contact',
      actions: (
        <>
          <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Contact'}
          </Button>
        </>
      ),
    });
  }, [setHeaderConfig, handleCancel, handleSave, isPending]);

  return (
    <>
      <div className="page-content">
        <div className="add-contact-content">
          <div ref={errorRef}>
            <SaveErrors message={error} problems={problems} />
          </div>

          {/* Name fields section */}
          <div className="expanded-section">
            <h4 className="section-header">Name</h4>
            <div className="section-content edit-section-content">
              <div className="edit-name-fields">
                <EditableField
                  value={form.firstName || ''}
                  onChange={(v) => setForm(f => ({ ...f, firstName: v || null }))}
                  placeholder="First name"
                />
                <EditableField
                  value={form.lastName || ''}
                  onChange={(v) => setForm(f => ({ ...f, lastName: v || null }))}
                  placeholder="Last name"
                />
                <EditableField
                  value={form.company || ''}
                  onChange={(v) => setForm(f => ({ ...f, company: v || null }))}
                  placeholder="Company"
                />
                <EditableField
                  value={form.title || ''}
                  onChange={(v) => setForm(f => ({ ...f, title: v || null }))}
                  placeholder="Title"
                />
              </div>
            </div>
          </div>

          {/* Categories section */}
          <CategoriesSection
            categories={form.categories}
            isEditMode={true}
            onCategoriesChange={(categories) => setForm(f => ({ ...f, categories }))}
          />

          <PhoneSection
            phones={form.phones}
            isEditMode={true}
            onPhonesChange={(phones) => setForm(f => ({ ...f, phones }))}
          />

          <EmailSection
            emails={form.emails}
            isEditMode={true}
            onEmailsChange={(emails) => setForm(f => ({ ...f, emails }))}
          />

          {/* Locations section */}
          <LocationsSection
            addresses={form.addresses}
            isEditMode={true}
            onAddressesChange={(addresses) => setForm(f => ({ ...f, addresses }))}
          />

          {/* Birthday section */}
          <BirthdaySection
            birthday={form.birthday}
            isEditMode={true}
            onBirthdayChange={(birthday) => setForm(f => ({ ...f, birthday }))}
          />

          {/* Instant Messages section */}
          <InstantMessagesSection
            instantMessages={form.instantMessages}
            isEditMode={true}
            onInstantMessagesChange={(instantMessages) => setForm(f => ({ ...f, instantMessages }))}
          />

          {/* Social Links section */}
          <SocialLinksSection
            socialProfiles={form.socialProfiles}
            isEditMode={true}
            onSocialProfilesChange={(socialProfiles) => setForm(f => ({ ...f, socialProfiles }))}
          />

          {/* URLs section */}
          <UrlsSection
            urls={form.urls}
            isEditMode={true}
            onUrlsChange={(urls) => setForm(f => ({ ...f, urls }))}
          />

          {/* Related People section */}
          <RelatedPeopleSection
            relatedPeople={form.relatedPeople}
            isEditMode={true}
            onRelatedPeopleChange={(relatedPeople) => setForm(f => ({ ...f, relatedPeople }))}
          />

          {/* Notes section */}
          <div className="expanded-section">
            <h4 className="section-header">Notes</h4>
            <div className="section-content edit-section-content">
              <NotesSection
                notes={form.notes}
                isEditMode={true}
                onNotesChange={(notes) => setForm(f => ({ ...f, notes }))}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
