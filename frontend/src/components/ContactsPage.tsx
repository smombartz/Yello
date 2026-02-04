import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ContactList } from './ContactList';
import { MobileHeader } from './MobileHeader';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

export function ContactsPage() {
  const { isMobile } = useOutletContext<OutletContext>();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [search, setSearch] = useState('');

  const handleSearchToggle = () => {
    setMobileSearchOpen(!mobileSearchOpen);
  };

  return (
    <>
      {isMobile && (
        <MobileHeader
          title="All Contacts"
          onSearch={handleSearchToggle}
        />
      )}
      <div className={`search-container ${mobileSearchOpen ? 'mobile-search-open' : ''}`}>
        <span className="material-symbols-outlined">search</span>
        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ContactList search={search} />
    </>
  );
}
