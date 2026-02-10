import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useGroups } from '../api/hooks';
import { ContactList } from './ContactList';
import { Icon } from './Icon';

export function GroupsView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('contactViewMode') as 'list' | 'grid') || 'list';
  });
  const { data, isLoading, error } = useGroups();

  const handleGroupClick = (category: string) => {
    setSelectedCategory(category);
  };

  const handleBackToGroups = useCallback(() => {
    setSelectedCategory(null);
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      setHeaderConfig({
        title: selectedCategory,
        actions: (
          <button className="header-action-btn secondary" onClick={handleBackToGroups}>
            <Icon name="arrow-left" />
            Back to Groups
          </button>
        ),
      });
    } else {
      setHeaderConfig({
        title: 'Groups',
        info: data?.groups ? <span>{data.groups.length} groups</span> : undefined,
      });
    }
  }, [setHeaderConfig, selectedCategory, handleBackToGroups, data?.groups]);

  // When a category is selected, show the filtered contact list
  if (selectedCategory) {
    return (
      <div className="groups-view groups-filtered">
        <div className="groups-content">
          <ContactList
            categoryFilter={selectedCategory}
            viewMode={viewMode}
          />
        </div>
      </div>
    );
  }

  // Show the groups list
  return (
    <div className="groups-view">
      <div className="groups-content">
        {isLoading ? (
          <div className="groups-loading">
            <Icon name="arrows-rotate" className="spinning" />
            <p>Loading groups...</p>
          </div>
        ) : error ? (
          <div className="groups-error">
            <Icon name="circle-exclamation" />
            <p>Error loading groups: {error.message}</p>
          </div>
        ) : !data?.groups.length ? (
          <div className="groups-empty">
            <Icon name="folder-minus" />
            <h3>No Groups</h3>
            <p>Your contacts don't have any categories assigned yet.</p>
          </div>
        ) : (
          <div className="groups-grid">
            {data.groups.map((group) => (
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
    </div>
  );
}
