import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { ContactList } from './components/ContactList';
import { ContactDetail } from './components/ContactDetail';
import { ImportModal } from './components/ImportModal';
import { DeduplicationView } from './components/DeduplicationView';

type AppView = 'contacts' | 'deduplication';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('contacts');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close detail panel on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showImportModal) {
          setShowImportModal(false);
        } else if (selectedContactId !== null) {
          setSelectedContactId(null);
        } else if (currentView === 'deduplication') {
          setCurrentView('contacts');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showImportModal, selectedContactId, currentView]);

  const handleDeduplicateClick = () => {
    setSelectedContactId(null);
    setCurrentView('deduplication');
  };

  const handleBackToContacts = () => {
    setCurrentView('contacts');
  };

  if (currentView === 'deduplication') {
    return (
      <div className="app-layout dedup-layout">
        <Sidebar />
        <main className="main-content">
          <DeduplicationView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar />
        <main
          className="main-content"
          style={{ marginRight: selectedContactId !== null ? '400px' : 0 }}
        >
          <TopHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onImportClick={() => setShowImportModal(true)}
            onDeduplicateClick={handleDeduplicateClick}
          />
          <div className="page-content">
            <div className="page-header">
              <h1>Team Directory</h1>
              <p>Manage your contacts here.</p>
            </div>
            <ContactList
              search={debouncedSearch}
              onSelectContact={setSelectedContactId}
            />
          </div>
        </main>
      </div>

      {selectedContactId !== null && (
        <ContactDetail
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
        />
      )}

      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} />
      )}
    </>
  );
}

export default App;
