import { useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContacts } from '../api/hooks';
import { ContactRow } from './ContactRow';

interface ContactListProps {
  search: string;
}

const COLLAPSED_HEIGHT = 92;   // 80 + 12 (0.75rem gap)
const EXPANDED_HEIGHT = 462;   // 450 + 12 (0.75rem gap)
const PAGE_SIZE = 100;

export function ContactList({ search }: ContactListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, error } = useContacts(1, PAGE_SIZE, search || undefined);

  const handleToggle = useCallback((id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const virtualizer = useVirtualizer({
    count: data?.contacts.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      const contact = data?.contacts[index];
      return contact?.id === expandedId ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
    }, [data?.contacts, expandedId]),
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  if (isLoading) {
    return (
      <div className="loading-state">
        <span aria-busy="true">Loading contacts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        Error loading contacts: {error.message}
      </div>
    );
  }

  if (!data?.contacts.length) {
    return (
      <div className="empty-state">
        {search ? `No contacts match "${search}"` : 'No contacts yet. Import a VCF file to get started.'}
      </div>
    );
  }

  return (
    <div className="contact-list">
      <div className="contact-count">
        {data.total.toLocaleString()} contact{data.total !== 1 ? 's' : ''}
      </div>
      <div
        ref={parentRef}
        className="virtual-scroll-container"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const contact = data.contacts[virtualRow.index];
            const isExpanded = contact.id === expandedId;

            return (
              <div
                key={contact.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ContactRow
                  contact={contact}
                  isExpanded={isExpanded}
                  onToggle={handleToggle}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
