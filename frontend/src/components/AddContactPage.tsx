import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { ContactEmail, ContactPhone, ContactAddress, ContactSocialProfile, ContactCategory, ContactInstantMessage, ContactUrl, ContactRelatedPerson, CreateContactRequest } from '../api/types';
import { useCreateContact } from '../api/hooks';
import { MobileHeader } from './MobileHeader';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}
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
  NotesSection
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

export function AddContactPage() {
  const navigate = useNavigate();
  const { isMobile } = useOutletContext<OutletContext>();
  const createContactMutation = useCreateContact();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = () => {
    navigate('/contacts');
  };

  const handleSave = async () => {
    setError(null);

    // Build display name from first/last name or use company
    const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ') || form.company || '';

    if (!displayName.trim()) {
      setError('Please enter a name for the contact');
      return;
    }

    // Build the create request
    const createData: CreateContactRequest = {
      firstName: form.firstName,
      lastName: form.lastName,
      displayName: displayName.trim(),
      company: form.company,
      title: form.title,
      notes: form.notes,
      birthday: form.birthday,
      emails: form.emails.filter(e => e.email.trim()).map(e => ({
        email: e.email,
        type: e.type,
        isPrimary: e.isPrimary,
      })),
      phones: form.phones.filter(p => p.phone.trim()).map(p => ({
        phone: p.phone,
        phoneDisplay: p.phoneDisplay,
        countryCode: p.countryCode,
        type: p.type,
        isPrimary: p.isPrimary,
      })),
      addresses: form.addresses.filter(a =>
        a.street || a.city || a.state || a.postalCode || a.country
      ).map(a => ({
        street: a.street,
        city: a.city,
        state: a.state,
        postalCode: a.postalCode,
        country: a.country,
        type: a.type,
      })),
      socialProfiles: form.socialProfiles.filter(s => s.platform.trim() && s.username.trim()).map(s => ({
        platform: s.platform,
        username: s.username,
        profileUrl: s.profileUrl,
        type: s.type,
      })),
      categories: form.categories.filter(c => c.category.trim()).map(c => ({
        category: c.category,
      })),
      instantMessages: form.instantMessages.filter(im => im.service.trim() && im.handle.trim()).map(im => ({
        service: im.service,
        handle: im.handle,
        type: im.type,
      })),
      urls: form.urls.filter(u => u.url.trim()).map(u => ({
        url: u.url,
        label: u.label,
        type: u.type,
      })),
      relatedPeople: form.relatedPeople.filter(rp => rp.name.trim()).map(rp => ({
        name: rp.name,
        relationship: rp.relationship,
      })),
    };

    try {
      await createContactMutation.mutateAsync(createData);
      navigate('/contacts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contact');
    }
  };

  return (
    <>
      {isMobile ? (
        <MobileHeader title="New Contact" showBack />
      ) : (
        <header className="top-header">
          <div className="page-header">
            <button className="back-button" onClick={handleCancel}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1>New Contact</h1>
          </div>
          <div className="header-actions">
            <button className="secondary-button" onClick={handleCancel}>
              Cancel
            </button>
            <button
              className="primary-button"
              onClick={handleSave}
              disabled={createContactMutation.isPending}
            >
              {createContactMutation.isPending ? (
                <>
                  <span className="material-symbols-outlined spinning">sync</span>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">save</span>
                  <span>Save Contact</span>
                </>
              )}
            </button>
          </div>
        </header>
      )}

      <div className="page-content">
        <div className="add-contact-content">
          {/* Error message */}
          {error && (
            <div className="edit-error">
              <span className="material-symbols-outlined">error</span>
              {error}
            </div>
          )}

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

          {/* Contact Info section */}
          <ContactInfoSection
            emails={form.emails}
            phones={form.phones}
            isEditMode={true}
            onEmailsChange={(emails) => setForm(f => ({ ...f, emails }))}
            onPhonesChange={(phones) => setForm(f => ({ ...f, phones }))}
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
