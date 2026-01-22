import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContacts } from '../api/hooks';
import { ContactRow } from './ContactRow';

interface ContactListProps {
  search: string;
  onSelectContact: (id: number) => void;
}

const ROW_HEIGHT = 72;
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
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <span aria-busy="true">Loading contacts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pico-del-color)' }}>
        Error loading contacts: {error.message}
      </div>
    );
  }

  if (!data?.contacts.length) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pico-muted-color)' }}>
        {search ? `No contacts match "${search}"` : 'No contacts yet. Import a VCF file to get started.'}
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: '8px 16px', fontSize: '0.875rem', color: 'var(--pico-muted-color)', borderBottom: '1px solid var(--pico-muted-border-color)' }}>
        {data.total.toLocaleString()} contact{data.total !== 1 ? 's' : ''}
      </div>
      <div
        ref={parentRef}
        style={{
          height: 'calc(100vh - 180px)',
          overflow: 'auto',
        }}
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
