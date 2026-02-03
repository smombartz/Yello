import { useState, useEffect } from 'react';
import { TopHeader } from './TopHeader';
import { ContactList } from './ContactList';
import { ImportModal } from './ImportModal';
import { useLayoutModal } from './Layout';

export function ContactsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const { setModalOpen } = useLayoutModal();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Notify Layout about modal state
  useEffect(() => {
    setModalOpen(showImportModal);
  }, [showImportModal, setModalOpen]);

  // Handle Escape key for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showImportModal) {
        e.stopPropagation();
        setShowImportModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [showImportModal]);

  return (
    <>
      <TopHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onImportClick={() => setShowImportModal(true)}
      />
      <div className="page-content">
        <ContactList search={debouncedSearch} />
      </div>

      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} />
      )}
    </>
  );
}
