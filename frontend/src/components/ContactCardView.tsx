// frontend/src/components/ContactCardView.tsx
import type { ReactNode } from 'react';
import type {
  ContactPhone,
  ContactEmail,
  ContactAddress,
  ContactSocialProfile,
  ContactUrl,
  ContactRelatedPerson,
} from '../api/types';
import { Icon } from './Icon';
import {
  PhoneSection,
  EmailSection,
  LocationsSection,
  SocialLinksSection,
  BirthdaySection,
  UrlsSection,
  RelatedPeopleSection,
  NotesSection,
} from './ContactFormSections';

export interface ContactCardViewData {
  phones: ContactPhone[];
  emails: ContactEmail[];
  addresses: ContactAddress[];
  socialProfiles: ContactSocialProfile[];
  urls?: ContactUrl[];
  relatedPeople?: ContactRelatedPerson[];
  birthday: string | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ContactCardViewProps {
  data: ContactCardViewData;
  /** Optional content rendered after all sections (e.g. email history) */
  children?: ReactNode;
  /** Whether to show metadata (created/updated dates). Default true. */
  showMetadata?: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function MetadataSection({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) {
  return (
    <div className="expanded-section-view gap-lg">
      <div className="section-heading">
        <div className="section-heading-row">
          <Icon name="clock" />
          <span className="section-heading-label">Meta Data</span>
        </div>
      </div>
      <div className="metadata-row">
        <div className="metadata-pair">
          <span className="metadata-pair-label">Created </span>
          <span className="metadata-pair-value">{formatDate(createdAt)}</span>
        </div>
        <div className="metadata-pair">
          <span className="metadata-pair-label">Updated </span>
          <span className="metadata-pair-value">{formatDate(updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

export function ContactCardView({ data, children, showMetadata = true }: ContactCardViewProps) {
  const hasPhones = data.phones.length > 0;
  const hasEmails = data.emails.length > 0;
  const hasLocations = data.addresses.length > 0;
  const hasSocial = data.socialProfiles.length > 0;
  const hasUrls = (data.urls?.length ?? 0) > 0;
  const hasRelatedPeople = (data.relatedPeople?.length ?? 0) > 0;
  const hasBirthday = !!data.birthday;

  const hasRow1 = hasPhones || hasLocations || hasSocial;
  const hasRow2 = hasEmails || hasBirthday || hasRelatedPeople || hasUrls;

  return (
    <div className="expanded-content">
      {/* Row 1: Phone | Address | Social Links */}
      {hasRow1 && (
        <div className="expanded-row">
          {hasPhones && <PhoneSection phones={data.phones} isEditMode={false} />}
          {hasLocations && <LocationsSection addresses={data.addresses} isEditMode={false} />}
          {hasSocial && <SocialLinksSection socialProfiles={data.socialProfiles} isEditMode={false} />}
        </div>
      )}

      {/* Row 2: Email | Birthday+Related | Web Links */}
      {hasRow2 && (
        <div className="expanded-row">
          {hasEmails && <EmailSection emails={data.emails} isEditMode={false} />}
          {(hasBirthday || hasRelatedPeople) && (
            <div className="expanded-column">
              {hasBirthday && <BirthdaySection birthday={data.birthday} isEditMode={false} />}
              {hasRelatedPeople && (
                <RelatedPeopleSection relatedPeople={data.relatedPeople!} isEditMode={false} />
              )}
            </div>
          )}
          {hasUrls && <UrlsSection urls={data.urls!} isEditMode={false} />}
        </div>
      )}

      {/* Slot for extra content (e.g. EmailHistorySection) */}
      {children}

      {/* Notes + Metadata */}
      {showMetadata && data.createdAt && data.updatedAt ? (
        data.notes ? (
          <div className="expanded-row expanded-row-notes">
            <NotesSection notes={data.notes} isEditMode={false} />
            <MetadataSection createdAt={data.createdAt} updatedAt={data.updatedAt} />
          </div>
        ) : (
          <MetadataSection createdAt={data.createdAt} updatedAt={data.updatedAt} />
        )
      ) : data.notes ? (
        <NotesSection notes={data.notes} isEditMode={false} />
      ) : null}
    </div>
  );
}
