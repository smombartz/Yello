import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { ContactList } from './ContactList';
import { Button } from './ui/Button';
import { EXPANDED_CONTACT_PARAM, useSearchParamUpdater } from '../hooks/useSearchParamUpdater';
import type { OutletContext } from './Layout';

export function ContactsPage() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const updateParams = useSearchParamUpdater();
  const [totalContacts, setTotalContacts] = useState<number>(0);

  // The URL holds the list state so a copied link reproduces this exact view.
  const search = searchParams.get('q') ?? '';
  const sort = searchParams.get('sort') ?? 'name-asc';
  const viewMode = searchParams.get('view') === 'grid' ? 'grid' : 'list';
  const filterParam = searchParams.get('filter') ?? '';
  const filters = useMemo(() => new Set(filterParam.split(',').filter(Boolean)), [filterParam]);

  // Changing what the list shows also closes the expanded contact, which may no longer be in it.
  const setSearch = useCallback((q: string) => {
    updateParams({ q, [EXPANDED_CONTACT_PARAM]: null });
  }, [updateParams]);

  const setSort = useCallback((value: string) => {
    updateParams({ sort: value === 'name-asc' ? null : value, [EXPANDED_CONTACT_PARAM]: null });
  }, [updateParams]);

  const setViewMode = useCallback((mode: 'list' | 'grid') => {
    updateParams({ view: mode === 'grid' ? 'grid' : null, [EXPANDED_CONTACT_PARAM]: null });
  }, [updateParams]);

  const setFilters = useCallback((next: Set<string>) => {
    updateParams({ filter: Array.from(next).join(','), [EXPANDED_CONTACT_PARAM]: null });
  }, [updateParams]);

  useEffect(() => {
    setHeaderConfig({
      title: 'Contacts',
      search,
      onSearchChange: setSearch,
      searchPlaceholder: 'Search contacts...',
      info: <span>{totalContacts.toLocaleString()} contacts</span>,
      actions: (
        <Button
          variant="primary"
          icon="circle-plus"
          onClick={() => navigate('/contacts/new')}
        >
          Add Contact
        </Button>
      ),
    });
  }, [setHeaderConfig, search, setSearch, totalContacts, navigate]);

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
      filterString={filterParam || undefined}
    />
  );
}
