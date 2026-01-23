import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContacts } from '../api/hooks';
import { ContactRow } from './ContactRow';

interface ContactListProps {
  search: string;
  onSelectContact: (id: number) => void;
}

const ROW_HEIGHT = 80;
const PAGE_SIZE = 100;

export function ContactList({ search, onSelectContact }: ContactListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useContacts(1, PAGE_SIZE, search || undefined);

  const virtualizer = useVirtualizer({
    count: data?.contacts.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
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
            return (
              <div
                key={contact.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ContactRow
                  contact={contact}
                  onClick={onSelectContact}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
