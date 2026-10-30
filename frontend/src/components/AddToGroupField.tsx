import { useState } from 'react';
import { useAddContactToGroup, useSearchContacts } from '../api/hooks';
import type { ContactSearchResult } from '../api/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

/**
 * Search field above a group's contact list. What's typed filters the group's
 * list (the parent owns it as ?q=), and a dropdown suggests matching contacts
 * that aren't in the group yet; picking one adds it to the group and clears
 * the field, so several people can be added in a row.
 */
export function AddToGroupField({
  category,
  search,
  onSearchChange,
}: {
  category: string;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const trimmed = search.trim();
  const { data: results } = useSearchContacts(trimmed, undefined, category);
  const addToGroup = useAddContactToGroup();
  const matches = trimmed ? results ?? [] : [];
  const showDropdown = open && matches.length > 0;

  const selectMatch = (contact: ContactSearchResult) => {
    onSearchChange('');
    setHighlight(-1);
    addToGroup.mutate(
      { contactId: contact.id, category },
      {
        onSuccess: ({ added }) => setNotice({
          text: added ? `Added ${contact.displayName} to ${category}` : `${contact.displayName} is already in ${category}`,
        }),
        onError: (err) => setNotice({ text: `Couldn't add ${contact.displayName}: ${err.message}`, error: true }),
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
      return;
    }
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' && highlight >= 0 && highlight < matches.length) {
      // Typing is also a search, so Enter only adds a suggestion the user picked.
      e.preventDefault();
      selectMatch(matches[highlight]);
    }
  };

  return (
    <div className="add-to-group">
      <div className="name-combobox">
        <Icon name="magnifying-glass" className="add-to-group-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setOpen(true);
            setHighlight(-1);
            setNotice(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={`Search or add to ${category}...`}
          className="edit-input add-to-group-input"
          autoComplete="off"
          aria-label={`Search ${category} or add a contact to it`}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
        {showDropdown && (
          <ul className="name-combobox-dropdown" role="listbox" aria-label={`Add to ${category}`}>
            <li className="add-to-group-dropdown-label" aria-hidden="true">
              <Icon name="user-plus" /> Add to {category}
            </li>
            {matches.map((contact, i) => (
              <li key={contact.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  className={`name-combobox-item${i === highlight ? ' active' : ''}`}
                  // preventDefault keeps focus on the input so onClick fires before blur
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectMatch(contact)}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={28} />
                  <div className="name-combobox-item-info">
                    <strong>{contact.displayName}</strong>
                    <span className="name-combobox-item-detail">
                      {contact.primaryEmail || contact.primaryPhone || ''}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {notice && (
        <p className={`add-to-group-notice${notice.error ? ' error' : ''}`} role="status">
          {notice.text}
        </p>
      )}
    </div>
  );
}
