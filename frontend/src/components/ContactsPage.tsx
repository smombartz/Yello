import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ContactList } from './ContactList';
import { Icon } from './Icon';
import type { OutletContext } from './Layout';

export function ContactsPage() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [totalContacts, setTotalContacts] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sort, setSort] = useState('name-asc');
  const [filters, setFilters] = useState<Set<string>>(new Set());

  useEffect(() => {
    setHeaderConfig({
      title: 'Contacts',
      search,
      onSearchChange: setSearch,
      searchPlaceholder: 'Search contacts...',
      info: <span>{totalContacts.toLocaleString()} contacts</span>,
      actions: (
        <button
          className="header-action-btn"
          onClick={() => navigate('/contacts/new')}
        >
          <Icon name="circle-plus" />
          Add Contact
        </button>
      ),
    });
  }, [setHeaderConfig, search, totalContacts, navigate]);

  const filterString = Array.from(filters).join(',') || undefined;

  return (
    <ContactList
      search={search}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onTotalChange={setTotalContacts}
      sort={sort}
      onSortChange={setSort}
      filters={filters}
      onFiltersChange={setFilters}
      filterString={filterString}
    />
  );
}
