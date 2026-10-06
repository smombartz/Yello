import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { Button } from '../ui/Button';
import logoMark from '../../assets/landing/mark.svg';
import usMap from '../../assets/landing/us-map.webp';
import { SAMPLE_BOOK, upcomingBirthdays, type SampleContact } from './sampleBook';

/* ---------------------------------------------------------------------------
 * Merge: a duplicate pair that folds into one record as it scrolls into view.
 * This is the page's one authored motion. Reduced motion skips the autoplay
 * and leaves the Merge button to do it.
 * ------------------------------------------------------------------------- */

const MERGE_DELAY_MS = 900;

export function MergeVignette() {
  const ref = useRef<HTMLDivElement>(null);
  const [merged, setMerged] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        timer = window.setTimeout(() => {
          if (!touched.current) setMerged(true);
        }, MERGE_DELAY_MS);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  const toggle = () => {
    touched.current = true;
    setMerged((value) => !value);
  };

  return (
    <div ref={ref} className={`lp-merge${merged ? ' is-merged' : ''}`}>
      <div className="lp-merge__stack">
        <div className="lp-merge__card">
          <div className="lp-merge__head">
            <Avatar photoUrl={null} name="Sarah Chen" size={40} />
            <div className="lp-merge__who">
              <span className="lp-merge__name">Sarah Chen</span>
              <span className="lp-merge__role">Real Estate Broker {'•'} Greenfield Realty</span>
            </div>
            <span className="lp-merge__source">{merged ? 'iCloud + Google' : 'iCloud'}</span>
          </div>
          <ul className="lp-merge__fields">
            <li><Icon name="envelope" /><span>sarah@greenfieldrealty.com</span></li>
            <li className="lp-merge__gain" aria-hidden={!merged}>
              <div className="lp-merge__clip">
                <div className="lp-merge__field"><Icon name="envelope" /><span>sarah.chen.sf@gmail.com</span></div>
              </div>
            </li>
            <li><Icon name="phone" /><span>(415) 555-1001</span></li>
          </ul>
        </div>

        <div className="lp-merge__twin" aria-hidden={merged}>
          <div className="lp-merge__clip">
          <div className="lp-merge__card">
            <div className="lp-merge__head">
              <Avatar photoUrl={null} name="Sarah Chen" size={40} />
              <div className="lp-merge__who">
                <span className="lp-merge__name">Sarah Chen</span>
                <span className="lp-merge__role">Greenfield Realty</span>
              </div>
              <span className="lp-merge__source">Google</span>
            </div>
            <ul className="lp-merge__fields">
              <li><Icon name="envelope" /><span>sarah.chen.sf@gmail.com</span></li>
              <li><Icon name="phone" /><span>(415) 555-1001</span></li>
            </ul>
          </div>
          </div>
        </div>
      </div>

      <div className="lp-merge__foot">
        <p className="lp-merge__why" aria-live="polite">
          {merged ? (
            <>One record. Both emails kept.</>
          ) : (
            <>
              <span className="lp-merge__match">High match</span>
              Same name, same phone
            </>
          )}
        </p>
        <Button size="sm" onClick={toggle} icon={merged ? 'rotate-left' : 'code-merge'}>
          {merged ? 'Undo' : 'Merge'}
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sources: every import Yello has, flowing into one book.
 * ------------------------------------------------------------------------- */

const SOURCES = [
  { icon: 'apple', brand: true, name: 'iCloud', note: 'Your iPhone and Mac contacts' },
  { icon: 'google', brand: true, name: 'Google Contacts', note: 'Everyone in your Google account' },
  { icon: 'linkedin', brand: true, name: 'LinkedIn', note: 'Your connections export' },
  { icon: 'envelope', brand: false, name: 'Gmail', note: 'Your email history with each person' },
  { icon: 'address-card', brand: false, name: 'vCard', note: 'Any .vcf file, from anywhere' },
];

export function SourcesVignette() {
  return (
    <div className="lp-sources">
      <ul className="lp-sources__list">
        {SOURCES.map((source) => (
          <li key={source.name} className="lp-sources__item">
            <span className="lp-sources__icon" aria-hidden="true">
              <Icon name={source.icon} style={source.brand ? 'brands' : 'solid'} />
            </span>
            <span className="lp-sources__text">
              <span className="lp-sources__name">{source.name}</span>
              <span className="lp-sources__note">{source.note}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="lp-sources__into">
        <img src={logoMark} alt="" width={26} height={24} />
        <span>One record per person</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Birthdays: the Dashboard's upcoming list, computed from today.
 * ------------------------------------------------------------------------- */

const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function inDaysLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `in ${days} days`;
}

export function BirthdaysVignette() {
  const [today] = useState(() => new Date());
  const upcoming = upcomingBirthdays(today, 3);

  return (
    <div className="lp-panel">
      <p className="lp-panel__title">Upcoming birthdays</p>
      <ul className="lp-bdays">
        {upcoming.map(({ contact, date, turns, inDays }) => (
          <li key={contact.email} className="lp-bdays__row">
            <Avatar photoUrl={null} name={contact.name} size={36} />
            <span className="lp-bdays__who">
              <span className="lp-bdays__name">{contact.name}</span>
              <span className="lp-bdays__when">
                {dayFormat.format(date)} {'·'} turns {turns}
              </span>
            </span>
            <span className="lp-bdays__in">{inDaysLabel(inDays)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Map: the sample book pinned on a static OpenStreetMap snapshot.
 * The image is zoom-5 Web Mercator, cropped at world pixel (1229, 2778),
 * 1366 x 780 (see us-map.webp.json for its provenance).
 * ------------------------------------------------------------------------- */

const MAP = { world: 256 * 2 ** 5, x: 1229, y: 2778, width: 1366, height: 780 };
// On-screen distance under which pins merge into a cluster, about one pin wide.
// Measured in rendered pixels so pins never pile up as the tile narrows.
const CLUSTER_RADIUS_PX = 36;
const DEFAULT_MAP_WIDTH = 620;

function project(lat: number, lon: number): { x: number; y: number } {
  const rad = (lat * Math.PI) / 180;
  const mercY = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
  return {
    x: ((lon + 180) / 360) * MAP.world - MAP.x,
    y: mercY * MAP.world - MAP.y,
  };
}

interface MapGroup {
  x: number;
  y: number;
  people: SampleContact[];
}

/** Greedy grouping, like markercluster: `radius` is in source-image pixels. */
function clusterBook(radius: number): MapGroup[] {
  const groups: MapGroup[] = [];
  for (const contact of SAMPLE_BOOK) {
    const point = project(contact.lat, contact.lon);
    const near = groups.find((g) => Math.hypot(g.x - point.x, g.y - point.y) < radius);
    if (near) {
      near.people.push(contact);
      near.x += (point.x - near.x) / near.people.length;
      near.y += (point.y - near.y) / near.people.length;
    } else {
      groups.push({ ...point, people: [contact] });
    }
  }
  return groups;
}

interface MapVignetteProps {
  /** `tile`: the highlights tile, a picture. `fill`: the sample app's Map view,
   *  covering its box with pins you can open. */
  variant?: 'tile' | 'fill';
  onOpenContact?: (id: number) => void;
}

const roundTo8 = (n: number) => Math.round(n / 8) * 8;

export function MapVignette({ variant = 'tile', onOpenContact }: MapVignetteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const interactive = variant === 'fill';
  const [size, setSize] = useState(() => ({
    w: DEFAULT_MAP_WIDTH,
    h: (DEFAULT_MAP_WIDTH * MAP.height) / MAP.width,
  }));
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      // Round so sub-pixel jitter doesn't re-cluster on every frame of a resize.
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: roundTo8(width), h: roundTo8(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Same geometry as the image's object-fit: cover, centred. The tile's box has
  // the image's own aspect ratio, so there it is an exact fit with no offset.
  const scale = Math.max(size.w / MAP.width, size.h / MAP.height);
  const offsetX = (size.w - MAP.width * scale) / 2;
  const offsetY = (size.h - MAP.height * scale) / 2;
  const groups = useMemo(() => clusterBook(CLUSTER_RADIUS_PX / scale), [scale]);
  const open = groups.find((g) => g.people[0].id === selected) ?? null;

  const pinStyle = (group: MapGroup) => ({
    left: `${group.x * scale + offsetX}px`,
    top: `${group.y * scale + offsetY}px`,
  });

  const pinFace = (group: MapGroup) =>
    group.people.length > 1 ? (
      <span className="lp-map__cluster">{group.people.length}</span>
    ) : (
      <Avatar photoUrl={null} name={group.people[0].name} size={30} className="lp-map__avatar" />
    );

  const credit = (
    <a
      className="lp-map__credit"
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noopener noreferrer"
    >
      {'\u00A9'} OpenStreetMap contributors
    </a>
  );

  if (!interactive) {
    return (
      <div
        ref={ref}
        className="lp-map"
        role="img"
        aria-label="Map of the United States with the twenty sample contacts pinned by city, grouped where several live close together."
      >
        <img className="lp-map__base" src={usMap} alt="" width={MAP.width} height={MAP.height} loading="lazy" />
        {groups.map((group) => (
          <span key={group.people[0].id} className="lp-map__pin" style={pinStyle(group)}>
            {pinFace(group)}
          </span>
        ))}
        {credit}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="lp-map lp-map--fill"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setSelected(null);
      }}
    >
      <img className="lp-map__base" src={usMap} alt="" width={MAP.width} height={MAP.height} />
      {groups.map((group) => {
        const first = group.people[0];
        const label =
          group.people.length > 1
            ? `${group.people.length} people near ${first.city}`
            : `${first.name}, ${first.city}`;
        return (
          <button
            key={first.id}
            type="button"
            className={`lp-map__pin lp-map__pin--button${selected === first.id ? ' is-open' : ''}`}
            style={pinStyle(group)}
            aria-label={label}
            aria-expanded={selected === first.id}
            onClick={() => setSelected(selected === first.id ? null : first.id)}
          >
            {pinFace(group)}
          </button>
        );
      })}

      {open && (
        <div className="lp-map__popover">
          <div className="lp-map__popover-head">
            <span>
              {open.people.length === 1 ? open.people[0].city : `${open.people.length} people`}
            </span>
            <button type="button" className="lp-map__popover-close" aria-label="Close" onClick={() => setSelected(null)}>
              <Icon name="xmark" />
            </button>
          </div>
          <ul>
            {open.people.map((person) => (
              <li key={person.id}>
                <button type="button" onClick={() => onOpenContact?.(person.id)}>
                  <Avatar photoUrl={null} name={person.name} size={28} />
                  <span className="lp-map__popover-who">
                    <span className="lp-map__popover-name">{person.name}</span>
                    <span className="lp-map__popover-city">{person.city}</span>
                  </span>
                  <Icon name="chevron-right" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {credit}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Public card: switches decide what a stranger sees. Name and photo always
 * show; everything else is opt-in, field by field, as in the real profile.
 * ------------------------------------------------------------------------- */

type CardField = 'email' | 'phone' | 'linkedin' | 'city';

const CARD_FIELDS: { key: CardField; label: string; icon: string; brand?: boolean; value: string }[] = [
  { key: 'email', label: 'Email', icon: 'envelope', value: 'tom@pixelandink.studio' },
  { key: 'phone', label: 'Phone', icon: 'phone', value: '(503) 555-1008' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin', brand: true, value: 'in/tomandersson' },
  { key: 'city', label: 'City', icon: 'location-dot', value: 'Portland, OR' },
];

export function PublicCardVignette() {
  const [shown, setShown] = useState<Record<CardField, boolean>>({
    email: true,
    phone: false,
    linkedin: true,
    city: false,
  });
  const visible = CARD_FIELDS.filter((field) => shown[field.key]);

  return (
    <div className="lp-public">
      <div className="lp-public__stage">
        <div className="lp-public__card">
          <Avatar photoUrl={null} name="Tom Andersson" size={64} />
          <span className="lp-public__name">Tom Andersson</span>
          <span className="lp-public__role">Creative Director, Pixel &amp; Ink Studio</span>
          <ul className="lp-public__rows">
            {visible.map((field) => (
              <li key={field.key}>
                <Icon name={field.icon} style={field.brand ? 'brands' : 'solid'} />
                <span>{field.value}</span>
              </li>
            ))}
          </ul>
          <span className="lp-public__save" aria-hidden="true">Add to Contacts</span>
        </div>
      </div>

      <ul className="lp-public__switches">
        <li className="lp-public__always">
          <span>Name and photo</span>
          <span className="lp-public__always-note">Always shown</span>
        </li>
        {CARD_FIELDS.map((field) => (
          <li key={field.key}>
            <span id={`lp-switch-${field.key}`}>{field.label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={shown[field.key]}
              aria-labelledby={`lp-switch-${field.key}`}
              className="lp-switch"
              onClick={() => setShown((s) => ({ ...s, [field.key]: !s[field.key] }))}
            >
              <span className="lp-switch__thumb" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Export: one card as Yello writes it, vCard 3.0.
 * ------------------------------------------------------------------------- */

const VCARD: [string, string][] = [
  ['BEGIN', 'VCARD'],
  ['VERSION', '3.0'],
  ['N', 'Chen;Sarah;;;'],
  ['FN', 'Sarah Chen'],
  ['ORG', 'Greenfield Realty'],
  ['TITLE', 'Real Estate Broker'],
  ['EMAIL;TYPE=WORK', 'sarah@greenfieldrealty.com'],
  ['EMAIL;TYPE=HOME', 'sarah.chen.sf@gmail.com'],
  ['TEL;TYPE=WORK', '+14155551001'],
  ['BDAY', '1985-03-15'],
  ['CATEGORIES', 'Business,VIP'],
  ['END', 'VCARD'],
];

export function VcardVignette() {
  return (
    <div className="lp-vcard">
      <div className="lp-vcard__bar">
        <Icon name="file-lines" />
        <span>Sarah Chen.vcf</span>
      </div>
      <pre className="lp-vcard__body">
        {VCARD.map(([key, value]) => (
          <span key={key + value} className="lp-vcard__line">
            <span className="lp-vcard__key">{key}:</span>
            {value}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}
