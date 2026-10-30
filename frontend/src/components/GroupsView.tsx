import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useGroups } from '../api/hooks';
import { useArchivedCount } from '../api/archiveHooks';
import { ContactList } from './ContactList';
import { AddToGroupField } from './AddToGroupField';
import { Icon } from './Icon';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { EmptyState } from './ui/EmptyState';
import { EXPANDED_CONTACT_PARAM, useSearchParamUpdater } from '../hooks/useSearchParamUpdater';

export function GroupsView() {
  const { setHeaderConfig, isMobile } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  // The open group is the route (/groups/:category) and the search is ?q=, so both survive a copied link.
  const { category: selectedCategory = null } = useParams<{ category: string }>();
  const [searchParams] = useSearchParams();
  const updateParams = useSearchParamUpdater();
  // Groups grid: ?q= filters the groups. Open group: ?q= is the group's own search,
  // typed in AddToGroupField, while the header search is the universal contact search.
  const search = searchParams.get('q') ?? '';
  const [contactSearch, setContactSearch] = useState('');
  const [viewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('contactViewMode') as 'list' | 'grid') || 'list';
  });
  const { data, isLoading, error } = useGroups();
  const { data: archivedData } = useArchivedCount();
  // Archived is a built-in group, not a category: it opens the Archived view, which
  // is desktop-only (bulk restore/delete), so phones don't get the card.
  const archivedCount = isMobile ? 0 : archivedData?.count ?? 0;

  const setSearch = useCallback((q: string) => {
    updateParams({ q, [EXPANDED_CONTACT_PARAM]: null });
  }, [updateParams]);

  const handleGroupClick = (category: string) => {
    navigate(`/groups/${encodeURIComponent(category)}`);
  };

  const handleBackToGroups = useCallback(() => {
    navigate('/groups');
  }, [navigate]);

  useEffect(() => {
    if (selectedCategory) {
      // Same as the Dashboard: Enter searches all contacts on the Contacts page.
      const goToContacts = () => {
        const trimmed = contactSearch.trim();
        navigate(trimmed ? `/contacts?q=${encodeURIComponent(trimmed)}` : '/contacts');
      };
      setHeaderConfig({
        title: selectedCategory,
        breadcrumbs: [{ label: 'Groups', onClick: handleBackToGroups }],
        search: contactSearch,
        onSearchChange: setContactSearch,
        onSearchSubmit: goToContacts,
        searchPlaceholder: 'Search contacts...',
      });
    } else {
      setHeaderConfig({
        title: 'Groups',
        search,
        onSearchChange: setSearch,
        searchPlaceholder: 'Search groups...',
        info: data?.groups ? <span>{data.groups.length + (archivedCount > 0 ? 1 : 0)} groups</span> : undefined,
      });
    }
  }, [setHeaderConfig, selectedCategory, search, setSearch, contactSearch, navigate, handleBackToGroups, data?.groups, archivedCount]);

  const query = search.trim().toLowerCase();
  const filteredGroups = (data?.groups ?? []).filter((group) =>
    group.category.toLowerCase().includes(query)
  );
  const showArchived = archivedCount > 0 && 'archived'.includes(query);

  // When a category is selected, show the filtered contact list
  if (selectedCategory) {
    return (
      <div className="groups-view groups-filtered">
        <AddToGroupField
          key={selectedCategory}
          category={selectedCategory}
          search={search}
          onSearchChange={setSearch}
        />
        <ContactList
          categoryFilter={selectedCategory}
          search={search}
          viewMode={viewMode}
        />
      </div>
    );
  }

  // Show the groups list
  return (
    <div className="groups-view">
      {isLoading ? (
        <LoadingSpinner message="Loading groups..." />
      ) : error ? (
        <div className="groups-error">
          <Icon name="circle-exclamation" />
          <p>Error loading groups: {error.message}</p>
        </div>
      ) : !data?.groups.length && archivedCount === 0 ? (
        <EmptyState
          icon="folder-minus"
          title="No Groups"
          description="Your contacts don't have any categories assigned yet."
        />
      ) : !filteredGroups.length && !showArchived ? (
        <EmptyState
          icon="magnifying-glass"
          title="No matching groups"
          description={`No groups match "${search}"`}
        />
      ) : (
        <div className="groups-grid">
          {filteredGroups.map((group) => (
            <div
              key={group.category}
              className="card group-card"
              onClick={() => handleGroupClick(group.category)}
            >
              <div className="group-card-icon">
                <Icon name="users" />
              </div>
              <div className="group-card-info">
                <span className="group-name">{group.category}</span>
                <span className="group-count">
                  {group.contactCount} contact{group.contactCount !== 1 ? 's' : ''}
                </span>
              </div>
              <Icon name="chevron-right" className="group-card-arrow" />
            </div>
          ))}
          {showArchived && (
            <div className="card group-card" onClick={() => navigate('/archived')}>
              <div className="group-card-icon">
                <Icon name="box-archive" />
              </div>
              <div className="group-card-info">
                <span className="group-name">Archived</span>
                <span className="group-count">
                  {archivedCount} contact{archivedCount !== 1 ? 's' : ''}
                </span>
              </div>
              <Icon name="chevron-right" className="group-card-arrow" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
