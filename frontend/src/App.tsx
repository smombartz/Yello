import { useState, useEffect } from 'react';
import { ContactList } from './components/ContactList';
import { ContactDetail } from './components/ContactDetail';
import { ImportModal } from './components/ImportModal';

function App() {
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
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showImportModal, selectedContactId]);

  return (
    <>
      <main className="container" style={{ marginRight: selectedContactId !== null ? '400px' : 0, transition: 'margin-right 0.2s ease' }}>
        <header>
          <nav>
            <ul>
              <li><strong>Contact Manager</strong></li>
            </ul>
            <ul>
              <li>
                <input
                  type="search"
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </li>
              <li>
                <button onClick={() => setShowImportModal(true)}>Import VCF</button>
              </li>
            </ul>
          </nav>
        </header>

        <section>
          <ContactList
            search={debouncedSearch}
            onSelectContact={setSelectedContactId}
          />
        </section>
      </main>

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
