import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Pagination } from './Pagination';
import { useToast } from './ui/Toast';
import { useSearchContacts } from '../api/hooks';
import type { ContactSearchResult } from '../api/types';
import { formatDayAgo } from '../utils/relativeTime';
import {
  CHANNEL_ICONS, CHANNEL_LABELS, useAcceptAllSuggestions, useIgnoreHandles, useLinkHandles, useMessageHandles,
  useUnlinkHandles, type HandleItem, type HandleStatus,
} from '../api/messageHooks';

const PAGE_SIZE = 50;

/** What linking adds to the contact, in words */
function detailNoun(kind: HandleItem['kind']): string | null {
  switch (kind) {
    case 'phone': return 'number';
    case 'email': return 'email';
    case 'username': return 'Instagram';
    case 'url': return 'LinkedIn profile';
    default: return null;
  }
}

/** Type-to-search for the contact a handle belongs to. */
function ContactPicker({ initial, onPick, onCancel }: {
  initial: string;
  onPick: (contact: ContactSearchResult) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState(initial);
  const [highlight, setHighlight] = useState(0);
  const { data } = useSearchContacts(query.trim());
  const matches = data ?? [];

  return (
    <div className="name-combobox match-picker">
      <input
        autoFocus
        className="edit-input"
        value={query}
        placeholder="Search contacts…"
        autoComplete="off"
        onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && matches[highlight]) { e.preventDefault(); onPick(matches[highlight]); }
        }}
      />
      {matches.length > 0 && (
        <ul className="name-combobox-dropdown">
          {matches.map((contact, i) => (
            <li key={contact.id}>
              <button
                type="button"
                className={`name-combobox-item${i === highlight ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(contact)}
                onMouseEnter={() => setHighlight(i)}
              >
                <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={28} />
                <div className="name-combobox-item-info">
                  <strong>{contact.displayName}</strong>
                  <span className="name-combobox-item-detail">{contact.primaryEmail || contact.primaryPhone || ''}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HandleRow({ item, status, addToContact }: { item: HandleItem; status: HandleStatus; addToContact: boolean }) {
  const [picking, setPicking] = useState(false);
  const link = useLinkHandles();
  const ignore = useIgnoreHandles();
  const unlink = useUnlinkHandles();
  const { showToast } = useToast();
  const ref = [{ channel: item.channel, handle: item.handle }];
  const busy = link.isPending || ignore.isPending || unlink.isPending;
  const title = item.displayName || item.label;
  const showHandle = item.displayName && item.kind !== 'opaque';

  const linkTo = (contactId: number, name: string) => {
    setPicking(false);
    link.mutate({ handles: ref, contactId, addToContact }, {
      onSuccess: (r) => showToast(r.added ? `Linked to ${name} and added the ${detailNoun(item.kind)}` : `Linked to ${name}`),
      onError: (e) => showToast(e.message, { type: 'error' }),
    });
  };

  return (
    <li className="match-row">
      <span className={`match-channel channel-${item.channel}`} title={CHANNEL_LABELS[item.channel]}>
        <Icon name={CHANNEL_ICONS[item.channel].name} style={CHANNEL_ICONS[item.channel].style} />
      </span>
      <span className="match-main">
        <span className="match-name">{title}</span>
        <span className="match-detail">
          {showHandle && <>{item.label} · </>}
          {item.sent.toLocaleString()} sent · {item.received.toLocaleString()} received
          {item.group ? ` · ${item.group.toLocaleString()} in groups` : ''}
          {item.lastDay && ` · last ${formatDayAgo(item.lastDay)}`}
        </span>
      </span>

      <span className="match-actions">
        {status === 'unmatched' && (picking ? (
          <ContactPicker initial={item.displayName ?? ''} onPick={(c) => linkTo(c.id, c.displayName)} onCancel={() => setPicking(false)} />
        ) : (
          <>
            {item.suggestion && (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => linkTo(item.suggestion!.id, item.suggestion!.displayName)}>
                <Avatar photoUrl={item.suggestion.photoUrl} name={item.suggestion.displayName} size={20} />
                {item.suggestion.displayName}
              </Button>
            )}
            <Button size="sm" icon="magnifying-glass" disabled={busy} onClick={() => setPicking(true)}>
              {item.suggestion ? 'Someone else' : 'Pick contact'}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => ignore.mutate(ref)} title="Hide this person from the list">
              Ignore
            </Button>
          </>
        ))}
        {status === 'matched' && item.contact && (
          <>
            <Link to={`/contacts/${item.contact.id}`} className="match-linked">
              <Avatar photoUrl={item.contact.photoUrl} name={item.contact.displayName} size={20} />
              {item.contact.displayName}
            </Link>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => unlink.mutate(ref)} title="This isn’t them">
              Unlink
            </Button>
          </>
        )}
        {status === 'ignored' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => unlink.mutate(ref)}>Show again</Button>
        )}
      </span>
    </li>
  );
}

/**
 * "Needs a match": people from message sources that aren't linked to a
 * contact yet, busiest first. Only people the user wrote to at least once
 * are listed, so newsletters and spam stay out.
 */
export function MessageMatchQueue() {
  const [status, setStatus] = useState<HandleStatus>('unmatched');
  const [page, setPage] = useState(1);
  const [addToContact, setAddToContact] = useState(true);
  const { data, isLoading, error } = useMessageHandles(status, null, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const acceptAll = useAcceptAllSuggestions();
  const { showToast } = useToast();
  const suggestions = (data?.handles ?? []).filter(h => h.suggestion).length;

  return (
    <section className="card dashboard-card match-queue">
      <div className="top-contacts-controls">
        <div className="segmented" role="radiogroup" aria-label="Show">
          {([['unmatched', 'Needs a match'], ['matched', 'Matched'], ['ignored', 'Ignored']] as const).map(([id, label]) => (
            <button
              key={id} type="button" role="radio" aria-checked={status === id}
              className={`segment${status === id ? ' selected' : ''}`}
              onClick={() => { setStatus(id); setPage(1); }}
            >
              {label}
            </button>
          ))}
        </div>
        {status === 'unmatched' && (
          <>
            <label className="match-add-toggle" title="Linking also saves the number, email or profile on the contact (and syncs it)">
              <input type="checkbox" checked={addToContact} onChange={(e) => setAddToContact(e.target.checked)} />
              Add the number or email to the contact
            </label>
            {suggestions > 0 && (
              <Button
                size="sm" icon="wand-magic-sparkles" loading={acceptAll.isPending}
                onClick={() => acceptAll.mutate(undefined, {
                  onSuccess: (r) => showToast(`Linked ${r.updated} ${r.updated === 1 ? 'person' : 'people'} by name`),
                })}
                title="Link everyone whose name matches exactly one contact"
              >
                Accept all name matches
              </Button>
            )}
          </>
        )}
      </div>

      {status === 'unmatched' && (
        <p className="settings-description match-intro">
          People you’ve messaged who aren’t linked to a contact yet. Most people match on their own by phone,
          email or profile; these didn’t. Link them so their messages count toward the right contact.
        </p>
      )}

      {isLoading ? (
        <LoadingSpinner message="Loading..." />
      ) : error ? (
        <EmptyState icon="circle-exclamation" title="Couldn’t load the list" description={error.message} />
      ) : !data?.handles.length ? (
        <EmptyState
          icon={status === 'unmatched' ? 'circle-check' : 'user-slash'}
          title={status === 'unmatched' ? 'Everyone’s matched' : status === 'matched' ? 'Nobody matched yet' : 'Nobody ignored'}
          description={status === 'unmatched' ? 'Everyone you’ve written to is linked to a contact.' : undefined}
        />
      ) : (
        <>
          <ul className="match-list">
            {data.handles.map(item => (
              <HandleRow key={`${item.channel}:${item.handle}`} item={item} status={status} addToContact={addToContact} />
            ))}
          </ul>
          {data.total > PAGE_SIZE && (
            <Pagination currentPage={page} totalPages={Math.ceil(data.total / PAGE_SIZE)} onPageChange={setPage} />
          )}
        </>
      )}
    </section>
  );
}
