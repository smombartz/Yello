import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useGroups } from '../api/hooks';
import { ContactList } from './ContactList';
import { Icon } from './Icon';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { EmptyState } from './ui/EmptyState';

export function GroupsView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('contactViewMode') as 'list' | 'grid') || 'list';
  });
  const { data, isLoading, error } = useGroups();

  const handleGroupClick = (category: string) => {
    setSearch('');
    setSelectedCategory(category);
  };

  const handleBackToGroups = useCallback(() => {
    setSearch('');
    setSelectedCategory(null);
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      setHeaderConfig({
        title: selectedCategory,
        breadcrumbs: [{ label: 'Groups', onClick: handleBackToGroups }],
        search,
        onSearchChange: setSearch,
        searchPlaceholder: `Search in ${selectedCategory}...`,
      });
    } else {
      setHeaderConfig({
        title: 'Groups',
        search,
        onSearchChange: setSearch,
        searchPlaceholder: 'Search groups...',
        info: data?.groups ? <span>{data.groups.length} groups</span> : undefined,
      });
    }
  }, [setHeaderConfig, selectedCategory, search, handleBackToGroups, data?.groups]);

  const filteredGroups = (data?.groups ?? []).filter((group) =>
    group.category.toLowerCase().includes(search.trim().toLowerCase())
  );

  // When a category is selected, show the filtered contact list
  if (selectedCategory) {
    return (
      <div className="groups-view groups-filtered">
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
      ) : !data?.groups.length ? (
        <EmptyState
          icon="folder-minus"
          title="No Groups"
          description="Your contacts don't have any categories assigned yet."
        />
      ) : !filteredGroups.length ? (
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
        </div>
      )}
    </div>
  );
}
