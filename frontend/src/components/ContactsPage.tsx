import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ContactList } from './ContactList';
import { MobileHeader } from './MobileHeader';
import { ViewToggle } from './ViewToggle';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

export function ContactsPage() {
  const { isMobile } = useOutletContext<OutletContext>();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [totalContacts, setTotalContacts] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('contactViewMode') as 'list' | 'grid') || 'list';
  });

  const handleSearchToggle = () => {
    setMobileSearchOpen(!mobileSearchOpen);
  };

  const handleViewChange = (view: 'list' | 'grid') => {
    setViewMode(view);
    localStorage.setItem('contactViewMode', view);
  };

  const handleClearSearch = () => {
    setSearch('');
  };

  return (
    <>
      {isMobile && (
        <MobileHeader
          title="All Contacts"
          onSearch={handleSearchToggle}
        />
      )}

      {/* Unified header row */}
      <div className="contacts-page-header">
        {!isMobile && <h2 className="contacts-title">All Contacts</h2>}

        <div className={`search-container ${mobileSearchOpen ? 'mobile-search-open' : ''}`}>
          <span className="material-symbols-outlined search-icon">search</span>
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="search-clear-button"
              onClick={handleClearSearch}
              type="button"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>

        {!isMobile && (
          <>
            <div className="contact-count">
              {totalContacts.toLocaleString()} contact{totalContacts !== 1 ? 's' : ''}
            </div>
            <ViewToggle view={viewMode} onViewChange={handleViewChange} />
          </>
        )}
      </div>

      <ContactList
        search={search}
        viewMode={viewMode}
        onTotalChange={setTotalContacts}
      />
    </>
  );
}
