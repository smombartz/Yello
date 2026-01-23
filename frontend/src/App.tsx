import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { ContactList } from './components/ContactList';
import { ImportModal } from './components/ImportModal';
import { DeduplicationView } from './components/DeduplicationView';
import { CleanupView } from './components/CleanupView';

type AppView = 'contacts' | 'deduplication' | 'cleanup';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('contacts');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showImportModal) {
          setShowImportModal(false);
        } else if (currentView === 'deduplication' || currentView === 'cleanup') {
          setCurrentView('contacts');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showImportModal, currentView]);

  const handleDeduplicateClick = () => {
    setCurrentView('deduplication');
  };

  const handleCleanupClick = () => {
    setCurrentView('cleanup');
  };

  const handleBackToContacts = () => {
    setCurrentView('contacts');
  };

  if (currentView === 'cleanup') {
    return (
      <div className="app-layout cleanup-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          onBackToContacts={handleBackToContacts}
          currentView="cleanup"
        />
        <main className="main-content">
          <CleanupView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  if (currentView === 'deduplication') {
    return (
      <div className="app-layout dedup-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          onBackToContacts={handleBackToContacts}
          currentView="deduplication"
        />
        <main className="main-content">
          <DeduplicationView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar
          onDeduplicateClick={handleDeduplicateClick}
          onCleanupClick={handleCleanupClick}
          currentView="contacts"
        />
        <main className="main-content">
          <TopHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onImportClick={() => setShowImportModal(true)}
          />
          <div className="page-content">
            <ContactList search={debouncedSearch} />
          </div>
        </main>
      </div>

      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} />
      )}
    </>
  );
}

export default App;
