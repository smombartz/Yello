import { useState, type MouseEvent } from 'react';
import type { LinkedInEnrichment } from '../../api/types';
import { Avatar } from '../Avatar';
import { ContactCardView, type ContactCardViewData } from '../ContactCardView';
import { LinkedInSection } from '../ContactFormSections';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import {
  SAMPLE_BOOK,
  SAMPLE_GROUPS,
  SAMPLE_TOP_CITIES,
  upcomingBirthdays,
  type SampleContact,
} from './sampleBook';

/* The views inside the hero's sample app. Each is built from the app's own
 * classes or components so it reads as the product, filled with the demo
 * book's invented people. Nothing here touches the API. */

function toCardData(contact: SampleContact): ContactCardViewData {
  return {
    // No country code: the row shows the phone icon, not a flag emoji.
    phones: contact.phones.map((p, i) => ({ ...p, countryCode: null, isPrimary: i === 0 })),
    emails: contact.emails.map((e, i) => ({ ...e, isPrimary: i === 0 })),
    addresses: [contact.address],
    socialProfiles: [],
    birthday: contact.birthday,
    notes: contact.notes,
  };
}

function toEnrichment(contact: SampleContact): LinkedInEnrichment | null {
  const li = contact.linkedin;
  if (!li) return null;
  return {
    linkedinFirstName: contact.firstName,
    linkedinLastName: contact.lastName,
    headline: li.headline,
    about: li.about,
    jobTitle: li.jobTitle,
    companyName: li.companyName,
    companyLinkedinUrl: null,
    industry: li.industry,
    location: li.location,
    country: contact.address.country,
    followersCount: null,
    education: null,
    skills: li.skills,
    photoLinkedin: null,
    enrichedAt: null,
    positions: li.positions.map((p) => ({
      title: p.title,
      companyName: p.company,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
    certifications: null,
    languages: null,
    honors: null,
  };
}

/* ---------------------------------------------------------------------------
 * Contacts: the list rows, each expanding in place into the real contact card.
 * ------------------------------------------------------------------------- */

interface ContactListProps {
  contacts: SampleContact[];
  expandedId: number | null;
  onToggle: (id: number) => void;
  empty: string;
}

export function SampleContactList({ contacts, expandedId, onToggle, empty }: ContactListProps) {
  const { showToast } = useToast();

  // The sample people are invented but some domains may be real, so links
  // inside an expanded card (call, text, WhatsApp, email, maps) never leave.
  const blockLinks = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('a')) return;
    e.preventDefault();
    e.stopPropagation();
    showToast('These are invented people, so the sample doesn’t call, text or email them.', {
      duration: 3000,
    });
  };

  if (contacts.length === 0) {
    return <p className="lp-book__empty">{empty}</p>;
  }

  return (
    <ul className="lp-book__list">
      {contacts.map((contact) => {
        const expanded = contact.id === expandedId;
        const enrichment = expanded ? toEnrichment(contact) : null;
        return (
          <li key={contact.id} className={`lp-row${expanded ? ' is-expanded' : ''}`} data-row={contact.id}>
            <button
              type="button"
              className="lp-row__head"
              aria-expanded={expanded}
              aria-controls={`lp-row-${contact.id}`}
              onClick={() => onToggle(contact.id)}
            >
              <Avatar photoUrl={null} name={contact.name} size={48} />
              <span className="lp-row__who">
                <span className="lp-row__name">{contact.name}</span>
                <span className="lp-row__role">
                  {contact.title} {'•'} {contact.company}
                </span>
              </span>
              <span className="lp-row__detail">
                <Icon name="envelope" />
                <span>{contact.email}</span>
              </span>
              <span className="lp-row__detail lp-row__detail--phone">
                <Icon name="phone" />
                <span>{contact.phone}</span>
              </span>
              <span className="lp-row__actions" aria-hidden="true">
                <span>{contact.linkedin && <Icon name="linkedin" style="brands" />}</span>
                <span><Icon name={expanded ? 'chevron-up' : 'chevron-down'} /></span>
              </span>
            </button>
            {expanded && (
              <div id={`lp-row-${contact.id}`} className="lp-row__body" onClickCapture={blockLinks}>
                <ContactCardView data={toCardData(contact)} showMetadata={false}>
                  {enrichment && <LinkedInSection enrichment={enrichment} />}
                </ContactCardView>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * Dashboard: overview stats, upcoming birthdays and top cities.
 * ------------------------------------------------------------------------- */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function daysLabel(days: number): string {
  if (days === 0) return 'Today!';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

interface DashboardProps {
  onOpenContacts: () => void;
  onOpenContact: (id: number) => void;
  onSearchCity: (city: string) => void;
}

export function SampleDashboard({ onOpenContacts, onOpenContact, onSearchCity }: DashboardProps) {
  const [today] = useState(() => new Date());
  const birthdays = upcomingBirthdays(today, 5);
  const countries = new Set(SAMPLE_BOOK.map((c) => c.address.country)).size;

  return (
    <div className="lp-sample-dash">
      <div className="stat-cards-grid">
        <button type="button" className="card stat-card lp-btn-reset" onClick={onOpenContacts}>
          <span className="stat-icon"><Icon name="address-book" /></span>
          <span className="stat-info">
            <span className="stat-value">{SAMPLE_BOOK.length}</span>
            <span className="stat-label">Total Contacts</span>
          </span>
        </button>
        <div className="card stat-card lp-stat-static">
          <span className="stat-icon countries"><Icon name="globe" /></span>
          <span className="stat-info">
            <span className="stat-value">{countries}</span>
            <span className="stat-label">Countries</span>
          </span>
        </div>
        <div className="card stat-card lp-stat-static">
          <span className="stat-icon cities"><Icon name="city" /></span>
          <span className="stat-info">
            <span className="stat-value">{SAMPLE_TOP_CITIES.length}</span>
            <span className="stat-label">Cities</span>
          </span>
        </div>
        <div className="card stat-card lp-stat-static">
          <span className="stat-icon birthdays"><Icon name="cake-candles" /></span>
          <span className="stat-info">
            <span className="stat-value">{SAMPLE_BOOK.filter((c) => c.birthday).length}</span>
            <span className="stat-label">With Birthdays</span>
          </span>
        </div>
      </div>

      <div className="activity-grid">
        <div className="card dashboard-card">
          <div className="card-header">
            <Icon name="cake-candles" />
            <span className="lp-book__h lp-book__h--card">Upcoming Birthdays</span>
          </div>
          <div className="card-content">
            <ul className="dash-activity-list">
              {birthdays.map(({ contact, date, turns, inDays }) => (
                <li key={contact.id}>
                  <button type="button" className="contact-item lp-btn-reset" onClick={() => onOpenContact(contact.id)}>
                    <Avatar photoUrl={null} name={contact.name} size={40} />
                    <span className="dash-activity-info">
                      <span className="dash-activity-name">{contact.name}</span>
                      <span className="contact-meta">
                        {MONTHS[date.getMonth()]} {date.getDate()}, {ordinal(turns)} Birthday
                      </span>
                    </span>
                    <span className="contact-badge birthday-badge">{daysLabel(inDays)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card dashboard-card">
          <div className="card-header">
            <Icon name="city" />
            <span className="lp-book__h lp-book__h--card">Top Cities</span>
          </div>
          <div className="card-content">
            <ul className="geography-list">
              {SAMPLE_TOP_CITIES.slice(0, 5).map((item, index) => (
                <li key={item.city}>
                  <button type="button" className="geography-item lp-btn-reset" onClick={() => onSearchCity(item.city)}>
                    <span className="geography-rank">{index + 1}</span>
                    <span className="geography-name">
                      {item.city}
                      <span className="geography-country">, United States</span>
                    </span>
                    <span className="geography-count">{item.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Groups: the vCard categories, each opening its members.
 * ------------------------------------------------------------------------- */

export function SampleGroups({ onOpenGroup }: { onOpenGroup: (name: string) => void }) {
  return (
    <div className="groups-grid lp-sample-groups">
      {SAMPLE_GROUPS.map((group) => (
        <button
          key={group.name}
          type="button"
          className="card group-card lp-btn-reset"
          onClick={() => onOpenGroup(group.name)}
        >
          <span className="group-card-icon"><Icon name="users" /></span>
          <span className="group-card-info">
            <span className="group-name">{group.name}</span>
            <span className="group-count">{group.count} contacts</span>
          </span>
          <Icon name="chevron-right" className="group-card-arrow" />
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Tools: the import, cleanup, enrich and export sections, described in the
 * app's own words. They need a real book, so each one offers sign-in.
 * ------------------------------------------------------------------------- */

const TOOLS: { group: string; items: { icon: string; brand?: boolean; name: string; text: string }[] }[] = [
  {
    group: 'Import',
    items: [
      { icon: 'file-import', name: 'Import VCF', text: 'Import contacts from a VCF file exported from this app or another contacts application. Cards that carry a vCard UID you already have are skipped, so re-importing is safe.' },
      { icon: 'linkedin', brand: true, name: 'Import LinkedIn Connections', text: 'Import your LinkedIn connections from a CSV export. To export: LinkedIn → Settings → Data Privacy → Get a copy of your data → Connections.' },
      { icon: 'google', brand: true, name: 'Import Google Contacts', text: 'Import contacts from your Google account.' },
      { icon: 'apple', brand: true, name: 'Import from Apple iCloud', text: 'Connect your iCloud account to import contacts, using an app-specific password from your Apple account.' },
    ],
  },
  {
    group: 'Tools',
    items: [
      { icon: 'broom', name: 'Cleanup', text: 'Tidy addresses, place them on the map and repair broken links, a batch at a time.' },
      { icon: 'code-merge', name: 'Merge', text: 'Find the same person across your sources by email, phone, address or social profile, and merge them into one record.' },
    ],
  },
  {
    group: 'Enrich',
    items: [
      { icon: 'briefcase', name: 'LinkedIn Profile Data', text: 'Fetch professional information from LinkedIn for contacts that have LinkedIn URLs. Data is stored separately and never overwrites existing contact information.' },
      { icon: 'images', name: 'Fetch Contact Photos', text: 'Download profile photos for your contacts from Google Contacts and Gravatar. Only contacts with email addresses and no existing photo will be updated.' },
      { icon: 'envelope', name: 'Gmail Email History', text: 'Sync email history from Gmail for your contacts. Discover which contacts you email most or sync all contacts with email addresses.' },
    ],
  },
  {
    group: 'Export',
    items: [
      { icon: 'upload', name: 'Export Data', text: 'Download all your contacts as a VCF file that can be imported into other applications.' },
    ],
  },
];

export function SampleTools({ onSignIn }: { onSignIn: () => void }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="settings-content lp-sample-tools">
      {TOOLS.map((section) => (
        <div key={section.group} className="settings-group">
          <p className="settings-group-title">{section.group}</p>
          {section.items.map((item) => {
            const expanded = open === item.name;
            const id = `lp-tool-${item.name.replace(/\W+/g, '-').toLowerCase()}`;
            return (
              <div key={item.name} className={`settings-section collapsible-card${expanded ? ' expanded' : ''}`}>
                <button
                  type="button"
                  className="collapsible-header"
                  aria-expanded={expanded}
                  aria-controls={id}
                  onClick={() => setOpen(expanded ? null : item.name)}
                >
                  <span className="settings-section-header">
                    <Icon name={item.icon} style={item.brand ? 'brands' : 'solid'} />
                    <span className="lp-book__h lp-book__h--section">{item.name}</span>
                  </span>
                  <Icon name="chevron-down" className={`expand-icon${expanded ? ' rotated' : ''}`} />
                </button>
                {expanded && (
                  <div id={id} className="collapsible-content">
                    <p className="settings-description">{item.text}</p>
                    <Button size="sm" onClick={onSignIn}>
                      Sign in to use this
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
