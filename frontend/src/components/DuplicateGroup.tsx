import { useState } from 'react';
import { DuplicateContactCard } from './DuplicateContactCard';
import type { DuplicateGroup as DuplicateGroupType } from '../api/types';

interface DuplicateGroupProps {
  group: DuplicateGroupType;
  onMerge: (contactIds: number[], primaryContactId: number) => void;
  onKeepSeparate: (groupId: string) => void;
  isMerging: boolean;
}

function formatMatchingValue(value: string, field: string): string {
  if (field === 'address') {
    const [street, city, postalCode] = value.split('|');
    const parts = [street, city, postalCode].filter(Boolean);
    return parts.join(', ') || 'Same address';
  }
  if (field === 'social') {
    const [platform, username] = value.split(':');
    return `${platform}: @${username}`;
  }
  return value;
}

export function DuplicateGroup({
  group,
  onMerge,
  onKeepSeparate,
  isMerging,
}: DuplicateGroupProps) {
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<number>(group.contacts[0].id);

  const handleMerge = () => {
    const contactIds = group.contacts.map((c) => c.id);
    onMerge(contactIds, selectedPrimaryId);
  };

  return (
    <div className="duplicate-group">
      <div className="duplicate-group-header">
        <div className="duplicate-group-info">
          <span className="match-indicator">
            <span className="material-symbols-outlined">
              {group.matchingField === 'email'
                ? 'mail'
                : group.matchingField === 'phone'
                  ? 'phone'
                  : group.matchingField === 'address'
                    ? 'location_on'
                    : 'share'}
            </span>
            <span className="match-value">
              {formatMatchingValue(group.matchingValue, group.matchingField)}
            </span>
          </span>
          <span className="contact-count">{group.contacts.length} contacts</span>
        </div>
        <div className="duplicate-group-actions">
          <button
            className="merge-button"
            onClick={handleMerge}
            disabled={isMerging}
          >
            {isMerging ? 'Merging...' : 'Merge'}
          </button>
          <button
            className="keep-separate-button"
            onClick={() => onKeepSeparate(group.id)}
            disabled={isMerging}
          >
            Keep Separate
          </button>
        </div>
      </div>

      <div className="duplicate-group-cards">
        {group.contacts.map((contact) => (
          <div
            key={contact.id}
            className={`duplicate-card-wrapper ${selectedPrimaryId === contact.id ? 'primary' : ''}`}
            onClick={() => setSelectedPrimaryId(contact.id)}
          >
            {selectedPrimaryId === contact.id && (
              <div className="primary-badge">Primary</div>
            )}
            <DuplicateContactCard
              contact={contact}
              matchingField={group.matchingField}
              matchingValue={group.matchingValue}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
