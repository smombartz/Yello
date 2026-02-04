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
      <ContactList mobileSearchOpen={mobileSearchOpen} />
    </>
  );
}
