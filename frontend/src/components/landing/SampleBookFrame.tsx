import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { SearchBar } from '../ui/SearchBar';
import { SAMPLE_BOOK, SAMPLE_GROUPS, SAMPLE_TOP_CITIES, matchesQuery } from './sampleBook';
import { SampleContactList, SampleDashboard, SampleGroups, SampleTools } from './SampleViews';
import { MapVignette } from './Vignettes';

type View = 'dashboard' | 'contacts' | 'map' | 'groups' | 'tools';

// Same icons, labels and order as the app's NavRail.
const VIEWS: { id: View; icon: string; label: string }[] = [
  { id: 'dashboard', icon: 'house', label: 'Dashboard' },
  { id: 'contacts', icon: 'address-book', label: 'Contacts' },
  { id: 'map', icon: 'map', label: 'Map' },
  { id: 'groups', icon: 'users', label: 'Groups' },
  { id: 'tools', icon: 'screwdriver-wrench', label: 'Tools' },
];

/**
 * The landing hero's product shot: a small working copy of the app, filled
 * from the demo book. The rail switches views, contacts expand into the real
 * contact card, and search, groups, map pins and dashboard items all lead
 * back to people.
 *
 * The body only scrolls once someone has clicked or tabbed into the frame,
 * so a visitor scrolling the page past the hero is never caught by it.
 */
export function SampleBookFrame({ onSignIn }: { onSignIn: () => void }) {
  const [view, setView] = useState<View>('contacts');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Where the body should scroll after the next render: the top, or a row.
  const scrollTarget = useRef<'top' | number | null>(null);

  const go = (next: View) => {
    setView(next);
    setGroup(null);
    setExpandedId(null);
    scrollTarget.current = 'top';
  };

  const openContact = (id: number) => {
    setView('contacts');
    setGroup(null);
    setQuery('');
    setExpandedId(id);
    scrollTarget.current = id;
  };

  const toggle = (id: number) => {
    const opening = expandedId !== id;
    setExpandedId(opening ? id : null);
    if (opening) scrollTarget.current = id;
  };

  const openGroup = (name: string | null) => {
    setGroup(name);
    setExpandedId(null);
    scrollTarget.current = 'top';
  };

  const searchCity = (city: string) => {
    go('contacts');
    setQuery(city);
  };

  const measure = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    setHasMore(body.scrollHeight - body.scrollTop - body.clientHeight > 4);
  }, []);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const target = scrollTarget.current;
    scrollTarget.current = null;
    if (body && target === 'top') {
      body.scrollTop = 0;
    } else if (body && typeof target === 'number') {
      const row = body.querySelector<HTMLElement>(`[data-row="${target}"]`);
      if (row) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        body.scrollTo({ top: Math.max(row.offsetTop - 8, 0), behavior: smooth ? 'smooth' : 'auto' });
      }
    }
    measure();
  }, [view, group, query, expandedId, measure]);

  // Content can also change height on its own (the LinkedIn "About" toggle).
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [measure]);

  // Touch has no pointerleave to release the frame, so let go of it once the
  // hero scrolls away.
  useEffect(() => {
    const el = windowRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setEngaged(false);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const contacts =
    view === 'groups' && group
      ? SAMPLE_BOOK.filter((c) => c.categories.includes(group))
      : SAMPLE_BOOK.filter((c) => matchesQuery(c, query));

  let title: ReactNode = VIEWS.find((v) => v.id === view)!.label;
  let count: string | null = null;
  if (view === 'contacts') {
    count = query.trim() ? `${contacts.length} of ${SAMPLE_BOOK.length}` : `${SAMPLE_BOOK.length} contacts`;
  } else if (view === 'map') {
    count = `${SAMPLE_BOOK.length} people in ${SAMPLE_TOP_CITIES.length} cities`;
  } else if (view === 'groups') {
    if (group) {
      title = (
        <>
          <button type="button" className="lp-book__crumb" onClick={() => openGroup(null)}>
            Groups
          </button>
          <Icon name="chevron-right" className="lp-book__crumb-sep" />
          <span>{group}</span>
        </>
      );
      count = `${contacts.length} contacts`;
    } else {
      count = `${SAMPLE_GROUPS.length} groups`;
    }
  }

  return (
    <figure className="lp-book">
      <div
        ref={windowRef}
        className={`lp-book__window${engaged ? ' is-engaged' : ''}`}
        onPointerDown={() => setEngaged(true)}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setEngaged(false);
        }}
        onFocus={() => setEngaged(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false);
        }}
      >
        <nav className="lp-book__rail" aria-label="Sample app">
          {VIEWS.map((item) => {
            const active = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                className={`lp-book__rail-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => go(item.id)}
              >
                <Icon name={item.icon} />
                <span className="lp-book__rail-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="lp-book__main">
          <div className={`lp-book__bar lp-book__bar--${view}`}>
            <span className={`lp-book__title${group ? ' has-crumb' : ''}`}>{title}</span>
            {view === 'contacts' && (
              <SearchBar
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setExpandedId(null);
                }}
                placeholder={'Try “chef” or “Chicago”'}
                ariaLabel="Search the sample contacts"
                className="lp-book__search"
              />
            )}
            {count && (
              <span className="lp-book__count" aria-live="polite">
                {count}
              </span>
            )}
          </div>

          <div
            ref={bodyRef}
            className={`lp-book__body lp-book__body--${view}${hasMore ? ' has-more' : ''}`}
            onScroll={measure}
          >
            <div ref={contentRef} className="lp-book__content">
              {view === 'dashboard' && (
                <SampleDashboard
                  onOpenContacts={() => go('contacts')}
                  onOpenContact={openContact}
                  onSearchCity={searchCity}
                />
              )}
              {view === 'contacts' && (
                <SampleContactList
                  contacts={contacts}
                  expandedId={expandedId}
                  onToggle={toggle}
                  empty={`No one in the sample book matches “${query.trim()}”.`}
                />
              )}
              {view === 'map' && <MapVignette variant="fill" onOpenContact={openContact} />}
              {view === 'groups' &&
                (group ? (
                  <SampleContactList
                    contacts={contacts}
                    expandedId={expandedId}
                    onToggle={toggle}
                    empty="No one in this group."
                  />
                ) : (
                  <SampleGroups onOpenGroup={openGroup} />
                ))}
              {view === 'tools' && <SampleTools onSignIn={onSignIn} />}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="lp-caption">
        Twenty invented people from the Yello demo. Click around: open someone, or try the menu.
      </figcaption>
    </figure>
  );
}
