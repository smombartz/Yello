import { useState } from 'react';
import { DuplicateContactCard } from './DuplicateContactCard';
import type { DuplicateGroup as DuplicateGroupType, ConfidenceLevel } from '../api/types';

interface DuplicateGroupProps {
  group: DuplicateGroupType;
  onMerge: (contactIds: number[], primaryContactId: number) => void;
  onKeepSeparate: (groupId: string) => void;
  isMerging: boolean;
  selectedContactIds?: Set<number>;
  onToggleContactSelect?: (contactId: number) => void;
}

function formatMatchingValue(value: string, field: string, matchedCriteria?: string[]): string {
  if (field === 'recommended' && matchedCriteria && matchedCriteria.length > 0) {
    return formatMatchedCriteria(matchedCriteria);
  }
  if (field === 'address') {
    const [street, city, postalCode] = value.split('|');
    const parts = [street, city, postalCode].filter(Boolean);
    return parts.join(', ') || 'Same address';
  }
  if (field === 'social-links') {
    const [platform, username] = value.split(':');
    return `${platform}: @${username}`;
  }
  return value;
}

function formatMatchedCriteria(criteria: string[]): string {
  // Extract unique field types from criteria (format: "email:value", "phone:value", "name")
  const fieldTypes = [...new Set(
    criteria.map(c => c.includes(':') ? c.split(':')[0] : c)
  )];
  return fieldTypes
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
    .join(' + ');
}

function getConfidenceBadgeClass(confidence: ConfidenceLevel): string {
  const classMap: Record<ConfidenceLevel, string> = {
    very_high: 'very-high',
    high: 'high',
    medium: 'medium',
  };
  return `confidence-badge ${classMap[confidence]}`;
}

function getConfidenceLabel(confidence: ConfidenceLevel): string {
  const labelMap: Record<ConfidenceLevel, string> = {
    very_high: 'Very High',
    high: 'High',
    medium: 'Medium',
  };
  return labelMap[confidence];
}

export function DuplicateGroup({
  group,
  onMerge,
  onKeepSeparate,
  isMerging,
  selectedContactIds,
  onToggleContactSelect,
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
                    : group.matchingField === 'recommended'
                      ? 'auto_awesome'
                      : 'share'}
            </span>
            <span className="match-value">
              {formatMatchingValue(group.matchingValue, group.matchingField, group.matchedCriteria)}
            </span>
            {group.matchingField === 'recommended' && group.confidence && (
              <span className={getConfidenceBadgeClass(group.confidence)}>
                {getConfidenceLabel(group.confidence)}
              </span>
            )}
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
        {group.contacts.map((contact) => {
          const isSelected = selectedContactIds?.has(contact.id) ?? false;
          return (
            <div
              key={contact.id}
              className={`duplicate-card-wrapper ${selectedPrimaryId === contact.id ? 'primary' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedPrimaryId(contact.id)}
            >
              {selectedContactIds && onToggleContactSelect && (
                <div className="duplicate-card-checkbox">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleContactSelect(contact.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              {selectedPrimaryId === contact.id && (
                <div className="primary-badge">Primary</div>
              )}
              <DuplicateContactCard
                contact={contact}
                matchingField={group.matchingField}
                matchingValue={group.matchingValue}
                matchedCriteria={group.matchedCriteria}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
