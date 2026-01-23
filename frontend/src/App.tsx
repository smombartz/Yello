import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { ContactList } from './components/ContactList';
import { ImportModal } from './components/ImportModal';
import { DeduplicationView } from './components/DeduplicationView';

type AppView = 'contacts' | 'deduplication';

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
        } else if (currentView === 'deduplication') {
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

  const handleBackToContacts = () => {
    setCurrentView('contacts');
  };

  if (currentView === 'deduplication') {
    return (
      <div className="app-layout dedup-layout">
        <Sidebar onDeduplicateClick={handleDeduplicateClick} onBackToContacts={handleBackToContacts} currentView="deduplication" />
        <main className="main-content">
          <DeduplicationView onBack={handleBackToContacts} />
        </main>
      </div>
    );
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar onDeduplicateClick={handleDeduplicateClick} currentView="contacts" />
        <main className="main-content">
          <TopHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onImportClick={() => setShowImportModal(true)}
          />
          <div className="page-content">
            <div className="page-header">
              <h1>Team Directory</h1>
              <p>Manage your contacts here.</p>
            </div>
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
