import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { Icon } from './Icon';

type DepKind = 'external' | 'env' | 'packages' | 'tables' | 'services';

type ToolTag = 'desktop' | 'demo' | 'danger';

type Deps = Partial<Record<DepKind, string[]>>;

interface SubTool {
  id: string;
  name: string;
  icon: string;
  iconStyle?: 'solid' | 'brands';
  tags?: ToolTag[];
  how: string;
  deps: Deps;
}

interface ToolDoc {
  id: string;
  name: string;
  icon: string;
  iconStyle?: 'solid' | 'brands';
  location: string;
  tags?: ToolTag[];
  /** Full description for a single-purpose tool, or a short intro when `subtools` is set. */
  how: string;
  deps?: Deps;
  subtools?: SubTool[];
}

interface ToolGroup {
  title: string;
  tools: ToolDoc[];
}

const DEP_LABELS: Record<DepKind, string> = {
  external: 'External APIs',
  env: 'Env vars',
  packages: 'Packages',
  tables: 'Data tables',
  services: 'Services',
};

const DEP_ORDER: DepKind[] = ['external', 'env', 'packages', 'tables', 'services'];

const TAG_META: Record<ToolTag, { label: string; icon: string }> = {
  desktop: { label: 'Desktop only', icon: 'desktop' },
  demo: { label: 'Blocked in demo', icon: 'lock' },
  danger: { label: 'Irreversible', icon: 'triangle-exclamation' },
};

const TOOL_GROUPS: ToolGroup[] = [
  {
    title: 'Import',
    tools: [
      {
        id: 'import-vcf',
        name: 'Import VCF',
        icon: 'file-import',
        location: 'Tools → Import · POST /api/import',
        tags: ['demo'],
        how: 'Uploads a .vcf/.vcard file to /api/import with live upload progress. The backend validates the file, then parseVcf unfolds and splits the vCard blocks and parses each card with ical.js — name, emails, phones, addresses, org, title, notes, birthday, photo, categories and IMPP — plus regex for grouped labels, related names and social profiles. Phone numbers are normalized to E.164 via libphonenumber-js. Every card is inserted as a new contact (there is no de-duplication) along with all child rows; embedded photos are processed into four sizes and the full-text search index is rebuilt.',
        deps: {
          packages: ['ical.js', 'libphonenumber-js', 'sharp', 'better-sqlite3', '@fastify/multipart'],
          env: ['PHOTOS_PATH'],
          tables: ['contacts + child tables', 'contact_photos', 'contacts_unified_fts'],
          services: ['vcardParser', 'photoProcessor', 'importService'],
        },
      },
      {
        id: 'import-linkedin',
        name: 'Import LinkedIn Connections',
        icon: 'linkedin',
        iconStyle: 'brands',
        location: 'Tools → Import · POST /api/settings/import-linkedin',
        how: "Reads LinkedIn's Connections CSV export in the browser, skipping the four preamble lines, and parses the First Name / Last Name / URL / Email / Company / Position / Connected On columns. Rows are POSTed to the backend, which streams progress back over Server-Sent Events. Each row is matched against existing contacts by email, then by LinkedIn URL (in social profiles or URLs); a match updates only empty fields and adds the LinkedIn profile and category, while no match creates a new contact.",
        deps: {
          packages: ['better-sqlite3', 'SSE (raw Fastify reply)'],
          tables: ['contacts', 'contact_emails', 'contact_social_profiles', 'contact_categories', 'contact_urls', 'contacts_unified_fts'],
          services: ['linkedinImportService'],
        },
      },
      {
        id: 'import-google',
        name: 'Import Google Contacts',
        icon: 'google',
        iconStyle: 'brands',
        location: 'Tools → Import · POST /api/google-contacts/fetch',
        how: 'Checks whether the signed-in Google token carries the contacts scope; if not, it prompts for re-consent. On fetch, the backend refreshes the access token if needed and pages through the Google People API (people/me/connections), downloading non-default profile photos. Results are matched against existing contacts at very-high / high / medium confidence so the user can merge, skip or import each one, then imported with field-level union merging and photo processing.',
        deps: {
          external: ['Google People API', 'Google OAuth token endpoint'],
          env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_URL', 'SESSION_SECRET'],
          packages: ['libphonenumber-js', 'sharp', 'better-sqlite3', '@fastify/oauth2'],
          tables: ['contacts (+ google_resource_name)', 'child tables', 'contact_photos', 'user_settings', 'auth: users'],
          services: ['googlePeopleService', 'googleAuthService', 'icloudMatchingService', 'nameMatchingService', 'photoProcessor'],
        },
      },
    ],
  },
  {
    title: 'Sync',
    tools: [
      {
        id: 'sync-apple',
        name: 'Sync Apple Contacts',
        icon: 'apple',
        iconStyle: 'brands',
        location: 'Tools → Sync · POST /api/icloud/fetch',
        how: 'The user connects with their Apple ID email and an app-specific password, which is verified against iCloud and stored encrypted (AES, keyed from SESSION_SECRET). Importing uses tsdav’s CardDAV client to pull vCards from every iCloud address book, which are then parsed with the same vCard parser as file import. Fetched contacts are previewed with the shared matcher and imported with the same new/merge logic as Google (photos tagged "icloud").',
        deps: {
          external: ['iCloud CardDAV (contacts.icloud.com)', 'Apple app-specific password'],
          env: ['SESSION_SECRET'],
          packages: ['tsdav', 'ical.js', 'libphonenumber-js', 'sharp', 'better-sqlite3'],
          tables: ['user_settings (icloud_email, icloud_app_password)', 'contacts + child tables', 'contact_photos', 'contacts_unified_fts'],
          services: ['icloudService', 'icloudMatchingService', 'nameMatchingService', 'photoProcessor', 'vcardParser'],
        },
      },
      {
        id: 'sync-google',
        name: 'Sync Google Contacts',
        icon: 'google',
        iconStyle: 'brands',
        location: 'Tools → Sync · shares Import Google Contacts',
        how: 'Uses the same GoogleContactsImportContent component and backend flow as Import Google Contacts — it reuses the Google People API connection and the field-union merge logic. It is surfaced under Sync as the ongoing way to pull in Google contacts once access has been granted. See Import Google Contacts for the full flow and dependencies.',
        deps: {
          external: ['Google People API'],
          env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_URL', 'SESSION_SECRET'],
          services: ['googlePeopleService', 'googleAuthService', '(same as Import Google Contacts)'],
        },
      },
    ],
  },
  {
    title: 'Tools',
    tools: [
      {
        id: 'cleanup',
        name: 'Cleanup',
        icon: 'broom',
        location: 'Tools → Tools · /cleanup',
        tags: ['desktop'],
        how: 'A tabbed workspace (desktop only) for finding and fixing low-quality contact data across five categories. Selected contacts can be archived or deleted, with cascading child-row cleanup. Each tab below is a distinct detector with its own backend service.',
        subtools: [
          {
            id: 'cleanup-empty',
            name: 'Empty Contacts',
            icon: 'user-slash',
            how: 'Finds truly-empty contacts (no name and no data) and name-only contacts (a name but nothing else), so you can bulk-archive or delete them in one pass.',
            deps: {
              tables: ['contacts + child tables', 'contacts_unified_fts'],
              services: ['cleanupService'],
            },
          },
          {
            id: 'cleanup-emails',
            name: 'Problematic Emails',
            icon: 'at',
            how: 'Flags contacts whose emails span many different domains (adjustable threshold, default 3) or pile many addresses onto a single domain — usually a symptom of a bad merge or a noisy bulk import.',
            deps: {
              tables: ['contacts', 'contact_emails'],
              services: ['cleanupService'],
            },
          },
          {
            id: 'cleanup-social',
            name: 'Social Links',
            icon: 'share-nodes',
            how: 'Detects the same social profile shared across multiple contacts (cross-contact) and duplicate social links within a single contact (within-contact), with one-click fix-all for each.',
            deps: {
              tables: ['contact_social_profiles', 'contacts'],
              services: ['socialLinksCleanupService'],
            },
          },
          {
            id: 'cleanup-invalid',
            name: 'Invalid Links',
            icon: 'link-slash',
            how: 'Pattern-matches malformed or invalid URLs across all contacts and lets you remove them in bulk.',
            deps: {
              tables: ['contact_urls'],
              services: ['invalidLinksCleanupService'],
            },
          },
          {
            id: 'cleanup-addresses',
            name: 'Addresses',
            icon: 'location-dot',
            how: 'Four address operations: Fix malformed addresses, Normalize (remove junk addresses), merge within-contact Duplicates, and Geocode addresses to latitude/longitude. Geocoding calls the HERE.com API and requires HERE_API_KEY; the other three run entirely locally.',
            deps: {
              external: ['HERE.com Geocoding API (geocoding only)'],
              env: ['HERE_API_KEY (geocoding only)'],
              tables: ['contact_addresses (lat/lng + geo status)'],
              services: ['addressCleanupService', 'geocoding'],
            },
          },
        ],
      },
      {
        id: 'merge',
        name: 'Merge',
        icon: 'code-merge',
        location: 'Tools → Tools · /merge (Resolve Duplicates)',
        tags: ['desktop'],
        how: 'Scans all contacts, builds inverted indexes on emails, phones and social profiles, and scores candidate pairs — +1 each for a shared email, phone or social profile, and +1 for a name match via nameMatchingService (normalization plus a large nickname map). Pairs are grouped with union-find and tiered by confidence (very-high / high / medium). Choosing a primary merges the group in a single transaction: unioning all child rows, preserving the best photo, concatenating notes, deleting the secondaries, and updating the search index.',
        deps: {
          packages: ['better-sqlite3'],
          tables: ['contacts + all child tables', 'contacts_unified_fts'],
          services: ['deduplicationService', 'mergeService', 'nameMatchingService', 'photoProcessor'],
        },
      },
      {
        id: 'enrich',
        name: 'Enrich',
        icon: 'wand-magic-sparkles',
        location: 'Tools → Enrich · /tools',
        how: 'Three independent enrichment tools that add data to your contacts from external sources. Each runs on demand, streams live progress over SSE, and stores data without overwriting what you already have.',
        subtools: [
          {
            id: 'enrich-linkedin',
            name: 'LinkedIn Profile Data',
            icon: 'briefcase',
            tags: ['demo'],
            how: 'Groups contacts by enrichment state (enriched / ready / failed / no LinkedIn), where "ready" means a contact has a LinkedIn URL but no enrichment row yet. Each user connects their own Apify account by entering an API key in Tools → Enrich (validated against Apify and stored encrypted per-user in user_settings). Starting a run executes the Apify supreme_coder~linkedin-profile-scraper actor over the collected URLs, polls for completion, and stores each profile (headline, about, job, company, education, skills and more) in linkedin_enrichment; the LinkedIn photo is processed in and failures are recorded separately. A "Recover from Apify Dataset" option re-reads an already-completed dataset by ID (skipping the actor run) to salvage results from a run whose stream was lost.',
            deps: {
              external: ['Apify API', 'actor: supreme_coder~linkedin-profile-scraper'],
              packages: ['better-sqlite3', 'sharp', '@sinclair/typebox'],
              tables: ['user_settings', 'linkedin_enrichment', 'linkedin_enrichment_failures', 'contacts', 'contact_social_profiles', 'contact_urls', 'contact_photos', 'contacts_unified_fts'],
              services: ['apifyEnrichmentService'],
            },
          },
          {
            id: 'enrich-photos',
            name: 'Fetch Contact Photos',
            icon: 'images',
            how: 'For every non-archived contact that has an email, it bulk-fetches Google "other contacts" photos via the People API, then per contact tries a Google photo match first and falls back to Gravatar (SHA-256 of the email with ?d=404 so missing avatars are skipped). The chosen image is re-encoded by Sharp into four sizes and stored — contacts.photo_hash is only set when currently empty, so an existing primary photo is never overwritten, while every source is recorded in contact_photos.',
            deps: {
              external: ['Google People API (otherContacts)', 'Gravatar'],
              env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PHOTOS_PATH'],
              packages: ['sharp', 'better-sqlite3', 'Node crypto/fs'],
              tables: ['contacts (photo_hash)', 'contact_emails', 'contact_photos'],
              services: ['contactPhotoService', 'googlePeopleService', 'profileImageService', 'googleAuthService'],
            },
          },
          {
            id: 'enrich-gmail',
            name: 'Gmail Email History',
            icon: 'envelope',
            how: 'Two phases. Discover (recent / frequent strategies) scans up to a chosen depth of Gmail messages, reads their header metadata, tallies each correspondent by message count and latest date, and matches those addresses to contacts. Sync (explicit IDs, or the unsynced / all strategies) fetches each contact’s messages — a full sync via a from:/to: search or an incremental sync via the Gmail history API — and inserts every message (subject, date, direction, snippet) into contact_emails_history, updating the contact’s Gmail history id and last-sync timestamp.',
            deps: {
              external: ['Gmail API (scope: gmail.readonly)'],
              env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APP_URL'],
              packages: ['better-sqlite3', '@sinclair/typebox'],
              tables: ['contact_emails_history', 'contacts (gmail_history_id, gmail_last_sync_at)', 'contact_emails', 'auth: users'],
              services: ['emailDiscoveryService', 'emailSyncService', 'googleAuthService'],
            },
          },
        ],
      },
    ],
  },
  {
    title: 'Export',
    tools: [
      {
        id: 'export',
        name: 'Export Data',
        icon: 'upload',
        location: 'Tools → Export · GET /api/contacts/export/vcf',
        how: 'Opens /api/contacts/export/vcf as a browser download. The backend exports all non-archived contacts, reusing each contact’s stored raw vCard and injecting the current photo, or regenerating the vCard from database fields for contacts without one (e.g. LinkedIn or manually added). An optional regenerate mode rebuilds every vCard from fields, with country-formatted addresses.',
        deps: {
          packages: ['better-sqlite3', 'Node fs/path'],
          env: ['USER_DATA_PATH'],
          tables: ['contacts', 'contact_emails', 'contact_phones', 'contact_addresses', 'contact_social_profiles', 'contact_categories'],
          services: ['vcardGenerator', 'addressFormatter'],
        },
      },
    ],
  },
  {
    title: 'Danger Zone',
    tools: [
      {
        id: 'delete-all',
        name: 'Delete All Contacts',
        icon: 'triangle-exclamation',
        location: 'Tools → Danger Zone · DELETE /api/contacts/all',
        tags: ['danger'],
        how: 'Requires typing DELETE to confirm, then calls DELETE /api/contacts/all. The backend counts the rows, deletes all contacts (child tables cascade via foreign keys) and clears the unified search index, returning the deleted count. Note: photo files on disk are not removed, so orphaned photos may remain.',
        deps: {
          packages: ['better-sqlite3'],
          tables: ['contacts (+ cascading children)', 'contacts_unified_fts'],
        },
      },
    ],
  },
];

// Every anchor the TOC tracks: each tool header id, plus every subtool section id.
const ALL_ANCHOR_IDS = TOOL_GROUPS.flatMap((g) =>
  g.tools.flatMap((t) => [t.id, ...(t.subtools?.map((s) => s.id) ?? [])])
);

function DepsList({ deps }: { deps: Deps }) {
  const rows = DEP_ORDER.filter((kind) => deps[kind]?.length);
  if (rows.length === 0) return null;
  return (
    <dl className="docs-deps">
      {rows.map((kind) => (
        <div key={kind} className="docs-dep-row">
          <dt className="docs-dep-label">{DEP_LABELS[kind]}</dt>
          <dd className="docs-dep-chips">
            {deps[kind]!.map((item) => (
              <span key={item} className={`docs-chip docs-chip--${kind}`}>
                {item}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Tags({ tags }: { tags?: ToolTag[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="docs-tool-tags">
      {tags.map((tag) => (
        <span key={tag} className={`docs-tag docs-tag--${tag}`}>
          <Icon name={TAG_META[tag].icon} />
          {TAG_META[tag].label}
        </span>
      ))}
    </div>
  );
}

export function DocsView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [activeId, setActiveId] = useState<string>(ALL_ANCHOR_IDS[0]);

  useEffect(() => {
    setHeaderConfig({ title: 'Docs' });
  }, [setHeaderConfig]);

  // Highlight the section nearest the top of the viewport in the table of contents.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 }
    );
    ALL_ANCHOR_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const handleTocClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
      history.replaceState(null, '', `#${id}`);
    }
  };

  return (
    <div className="docs-view">
      <div className="docs-layout">
        <div className="docs-main">
          <p className="docs-intro">
            A reference for every tool in the <strong>Tools</strong> section — how each one works and
            what it depends on. Tools are grouped exactly as they appear on the Tools page; tools with
            several distinct features (Cleanup, Enrich) break out each feature separately.
          </p>

          {TOOL_GROUPS.map((group) => (
            <section key={group.title} className="docs-group">
              <h2 className="docs-group-title">{group.title}</h2>
              {group.tools.map((tool) => (
                <article key={tool.id} className="docs-tool">
                  <header id={tool.id} className="docs-tool-header">
                    <span className="docs-tool-icon">
                      <Icon name={tool.icon} style={tool.iconStyle ?? 'solid'} />
                    </span>
                    <div className="docs-tool-heading">
                      <h3>{tool.name}</h3>
                      <span className="docs-tool-location">{tool.location}</span>
                    </div>
                    <Tags tags={tool.tags} />
                  </header>

                  <div className="docs-tool-body">
                    {tool.subtools ? (
                      <>
                        <p className="docs-how docs-how--intro">{tool.how}</p>
                        {tool.deps && (
                          <>
                            <h4 className="docs-subhead">Dependencies</h4>
                            <DepsList deps={tool.deps} />
                          </>
                        )}
                        <div className="docs-subtools">
                          {tool.subtools.map((sub) => (
                            <section key={sub.id} id={sub.id} className="docs-subtool">
                              <div className="docs-subtool-header">
                                <span className="docs-subtool-icon">
                                  <Icon name={sub.icon} style={sub.iconStyle ?? 'solid'} />
                                </span>
                                <h4>{sub.name}</h4>
                                <Tags tags={sub.tags} />
                              </div>
                              <p className="docs-how">{sub.how}</p>
                              <DepsList deps={sub.deps} />
                            </section>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <h4 className="docs-subhead">How it works</h4>
                        <p className="docs-how">{tool.how}</p>
                        {tool.deps && (
                          <>
                            <h4 className="docs-subhead">Dependencies</h4>
                            <DepsList deps={tool.deps} />
                          </>
                        )}
                      </>
                    )}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>

        <aside className="docs-toc" aria-label="Table of contents">
          <div className="docs-toc-inner">
            <p className="docs-toc-title">On this page</p>
            <nav>
              {TOOL_GROUPS.map((group) => (
                <div key={group.title} className="docs-toc-group">
                  <span className="docs-toc-group-label">{group.title}</span>
                  <ul>
                    {group.tools.map((tool) => (
                      <li key={tool.id}>
                        <a
                          href={`#${tool.id}`}
                          className={`docs-toc-link${activeId === tool.id ? ' active' : ''}`}
                          onClick={(e) => handleTocClick(e, tool.id)}
                        >
                          {tool.name}
                        </a>
                        {tool.subtools && (
                          <ul className="docs-toc-sublist">
                            {tool.subtools.map((sub) => (
                              <li key={sub.id}>
                                <a
                                  href={`#${sub.id}`}
                                  className={`docs-toc-link docs-toc-sublink${activeId === sub.id ? ' active' : ''}`}
                                  onClick={(e) => handleTocClick(e, sub.id)}
                                >
                                  {sub.name}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
