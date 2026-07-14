import { useState } from 'react';
import { useSearchContacts } from '../api/hooks';
import type { ContactSearchResult } from '../api/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

/**
 * Name field for a related person. When unlinked, typing shows a dropdown of
 * matching contacts; picking one links the entry (and the parent stores the
 * target id). Free text that never matches stays an unlinked plain name.
 * When linked, the name is shown as a locked chip with an × to unlink.
 */
export function RelatedPersonNameField({
  name,
  relatedContactId,
  excludeContactId,
  onNameChange,
  onLink,
  onUnlink,
}: {
  name: string;
  relatedContactId: number | null;
  excludeContactId?: number;
  onNameChange: (name: string) => void;
  onLink: (contact: ContactSearchResult) => void;
  onUnlink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const { data: results } = useSearchContacts(relatedContactId ? '' : name, excludeContactId);
  const matches = (results ?? []).filter((c) => c.id !== excludeContactId);

  if (relatedContactId != null) {
    return (
      <div className="linked-person-chip">
        <Avatar photoUrl={null} name={name} size={22} />
        <span className="linked-person-chip-name">{name}</span>
        <button
          type="button"
          className="linked-person-chip-remove"
          onClick={onUnlink}
          title="Unlink contact"
          aria-label="Unlink contact"
        >
          <Icon name="xmark" />
        </button>
      </div>
    );
  }

  const showDropdown = open && matches.length > 0;

  const selectMatch = (contact: ContactSearchResult) => {
    onLink(contact);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && highlight < matches.length) {
        e.preventDefault();
        selectMatch(matches[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div className="name-combobox">
      <input
        type="text"
        value={name}
        onChange={(e) => {
          onNameChange(e.target.value);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder="Name"
        className="edit-input"
        autoComplete="off"
      />
      {showDropdown && (
        <ul className="name-combobox-dropdown">
          {matches.map((contact, i) => (
            <li key={contact.id}>
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
  );
}
