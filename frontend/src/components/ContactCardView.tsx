// frontend/src/components/ContactCardView.tsx
import type { ReactNode } from 'react';
import type {
  ContactPhone,
  ContactEmail,
  ContactAddress,
  ContactSocialProfile,
  ContactCategory,
  ContactInstantMessage,
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
  CategoriesSection,
  InstantMessagesSection,
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

export interface ContactCardEditState {
  phones: ContactPhone[];
  emails: ContactEmail[];
  addresses: ContactAddress[];
  socialProfiles: ContactSocialProfile[];
  categories: ContactCategory[];
  instantMessages: ContactInstantMessage[];
  urls: ContactUrl[];
  relatedPeople: ContactRelatedPerson[];
  birthday: string | null;
  notes: string | null;
}

export interface SectionSuffixes {
  phones?: (index: number) => ReactNode;
  emails?: (index: number) => ReactNode;
  addresses?: (index: number) => ReactNode;
  socialProfiles?: (index: number) => ReactNode;
  urls?: (index: number) => ReactNode;
  categories?: (index: number) => ReactNode;
  instantMessages?: (index: number) => ReactNode;
  relatedPeople?: (index: number) => ReactNode;
  birthday?: () => ReactNode;
  notes?: () => ReactNode;
}

interface ContactCardViewProps {
  data: ContactCardViewData;
  /** Optional content rendered after all sections (e.g. email history) */
  children?: ReactNode;
  /** Whether to show metadata (created/updated dates). Default true. */
  showMetadata?: boolean;
  /** Enable edit mode. Default false. */
  isEditMode?: boolean;
  /** Edit state — required when isEditMode is true. */
  editState?: ContactCardEditState;
  /** Callback to update a field in editState. */
  onEditStateChange?: <K extends keyof ContactCardEditState>(key: K, value: ContactCardEditState[K]) => void;
  /** Suffix renderers for each section (e.g. visibility toggles). */
  sectionSuffixes?: SectionSuffixes;
  /** Section keys to hide entirely from edit mode. */
  hiddenSections?: Set<string>;
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

export function ContactCardView({
  data,
  children,
  showMetadata = true,
  isEditMode = false,
  editState,
  onEditStateChange,
  sectionSuffixes,
  hiddenSections,
}: ContactCardViewProps) {
  const hidden = hiddenSections ?? new Set<string>();

  // ─── Edit Mode ─────────────────────────────────────────────────
  if (isEditMode && editState && onEditStateChange) {
    return (
      <div className="expanded-content">
        {/* Row 1: Phone | Address | Social Links */}
        <div className="expanded-row">
          {!hidden.has('phones') && (
            <PhoneSection
              phones={editState.phones}
              isEditMode={true}
              onPhonesChange={(phones) => onEditStateChange('phones', phones)}
              renderItemSuffix={sectionSuffixes?.phones}
            />
          )}
          {!hidden.has('addresses') && (
            <LocationsSection
              addresses={editState.addresses}
              isEditMode={true}
              onAddressesChange={(addresses) => onEditStateChange('addresses', addresses)}
              renderItemSuffix={sectionSuffixes?.addresses}
            />
          )}
          {!hidden.has('socialProfiles') && (
            <SocialLinksSection
              socialProfiles={editState.socialProfiles}
              isEditMode={true}
              onSocialProfilesChange={(socialProfiles) => onEditStateChange('socialProfiles', socialProfiles)}
              renderItemSuffix={sectionSuffixes?.socialProfiles}
            />
          )}
        </div>

        {/* Row 2: Email | Birthday+Related | Web Links */}
        <div className="expanded-row">
          {!hidden.has('emails') && (
            <EmailSection
              emails={editState.emails}
              isEditMode={true}
              onEmailsChange={(emails) => onEditStateChange('emails', emails)}
              renderItemSuffix={sectionSuffixes?.emails}
            />
          )}
          <div className="expanded-column">
            {!hidden.has('birthday') && (
              <BirthdaySection
                birthday={editState.birthday}
                isEditMode={true}
                onBirthdayChange={(birthday) => onEditStateChange('birthday', birthday)}
                renderSuffix={sectionSuffixes?.birthday}
              />
            )}
            {!hidden.has('relatedPeople') && (
              <RelatedPeopleSection
                relatedPeople={editState.relatedPeople}
                isEditMode={true}
                onRelatedPeopleChange={(relatedPeople) => onEditStateChange('relatedPeople', relatedPeople)}
                renderItemSuffix={sectionSuffixes?.relatedPeople}
              />
            )}
          </div>
          {!hidden.has('urls') && (
            <UrlsSection
              urls={editState.urls}
              isEditMode={true}
              onUrlsChange={(urls) => onEditStateChange('urls', urls)}
              renderItemSuffix={sectionSuffixes?.urls}
            />
          )}
        </div>

        {/* Row 3: Categories | Instant Messages | (empty) */}
        {(!hidden.has('categories') || !hidden.has('instantMessages')) && (
          <div className="expanded-row">
            {!hidden.has('categories') && (
              <CategoriesSection
                categories={editState.categories}
                isEditMode={true}
                onCategoriesChange={(categories) => onEditStateChange('categories', categories)}
                renderItemSuffix={sectionSuffixes?.categories}
              />
            )}
            {!hidden.has('instantMessages') && (
              <InstantMessagesSection
                instantMessages={editState.instantMessages}
                isEditMode={true}
                onInstantMessagesChange={(instantMessages) => onEditStateChange('instantMessages', instantMessages)}
                renderItemSuffix={sectionSuffixes?.instantMessages}
              />
            )}
            <div />
          </div>
        )}

        {/* Slot for extra content */}
        {children}

        {/* Notes (full width) */}
        {!hidden.has('notes') && (
          <NotesSection
            notes={editState.notes}
            isEditMode={true}
            onNotesChange={(notes) => onEditStateChange('notes', notes)}
            renderSuffix={sectionSuffixes?.notes}
          />
        )}
      </div>
    );
  }

  // ─── View Mode ─────────────────────────────────────────────────
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
