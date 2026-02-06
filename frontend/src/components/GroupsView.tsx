import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useGroups } from '../api/hooks';
import { ContactList } from './ContactList';
import { MobileHeader } from './MobileHeader';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

interface GroupsViewProps {
  onBack?: () => void;
}

export function GroupsView({ onBack: _onBack }: GroupsViewProps) {
  const { isMobile } = useOutletContext<OutletContext>();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('contactViewMode') as 'list' | 'grid') || 'list';
  });
  const { data, isLoading, error } = useGroups();

  const handleGroupClick = (category: string) => {
    setSelectedCategory(category);
  };

  const handleBackToGroups = () => {
    setSelectedCategory(null);
  };

  // When a category is selected, show the filtered contact list
  if (selectedCategory) {
    return (
      <div className="groups-view groups-filtered">
        {isMobile ? (
          <MobileHeader title={selectedCategory} showBack />
        ) : (
          <div className="groups-header">
            <button className="back-button" onClick={handleBackToGroups}>
              <span className="material-symbols-outlined">arrow_back</span>
              Back to Groups
            </button>
            <h1>{selectedCategory}</h1>
          </div>
        )}
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
      {isMobile ? (
        <MobileHeader title="Groups" />
      ) : (
        <div className="groups-header">
          <h1>Groups</h1>
          {data?.groups && (
            <span className="groups-count-badge">{data.groups.length} groups</span>
          )}
        </div>
      )}

      <div className="groups-content">
        {isLoading ? (
          <div className="groups-loading">
            <span className="material-symbols-outlined spinning">sync</span>
            <p>Loading groups...</p>
          </div>
        ) : error ? (
          <div className="groups-error">
            <span className="material-symbols-outlined">error</span>
            <p>Error loading groups: {error.message}</p>
          </div>
        ) : !data?.groups.length ? (
          <div className="groups-empty">
            <span className="material-symbols-outlined">folder_off</span>
            <h3>No Groups</h3>
            <p>Your contacts don't have any categories assigned yet.</p>
          </div>
        ) : (
          <div className="groups-grid">
            {data.groups.map((group) => (
              <div
                key={group.category}
                className="group-card"
                onClick={() => handleGroupClick(group.category)}
              >
                <div className="group-card-icon">
                  <span className="material-symbols-outlined">group</span>
                </div>
                <div className="group-card-info">
                  <span className="group-name">{group.category}</span>
                  <span className="group-count">
                    {group.contactCount} contact{group.contactCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <span className="material-symbols-outlined group-card-arrow">chevron_right</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
