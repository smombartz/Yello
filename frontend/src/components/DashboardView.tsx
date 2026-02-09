import { useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useDashboardStats } from '../api/dashboardHooks';
import { Icon } from './Icon';

function getPhotoUrl(photoHash: string | null): string | null {
  if (!photoHash) return null;
  return `/photos/thumbnail/${photoHash.slice(0, 2)}/${photoHash}.jpg`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function formatBirthdayDays(daysUntil: number): string {
  if (daysUntil === 0) return 'Today!';
  if (daysUntil === 1) return 'Tomorrow';
  return `In ${daysUntil} days`;
}

export function DashboardView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useDashboardStats();

  useEffect(() => {
    setHeaderConfig({ title: 'Dashboard' });
  }, [setHeaderConfig]);

  const handleContactClick = (id: number) => {
    navigate(`/contacts/${id}`);
  };

  if (isLoading) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-loading">
          <div className="loading-spinner" />
          <p>Loading dashboard...</p>
        </div>
        <style>{dashboardStyles}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-error">
          <Icon name="circle-exclamation" />
          <p>Failed to load dashboard data</p>
        </div>
        <style>{dashboardStyles}</style>
      </div>
    );
  }

  return (
    <div className="dashboard-view">
      <div className="dashboard-content">
        {/* Overview Stats Row */}
        <section className="dashboard-section overview-section">
          <div className="stat-cards-grid">
            <div className="stat-card" onClick={() => navigate('/contacts')}>
              <div className="stat-icon">
                <Icon name="address-book" />
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.totalContacts.toLocaleString()}</div>
                <div className="stat-label">Total Contacts</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon countries">
                <Icon name="globe" />
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.totalCountries.toLocaleString()}</div>
                <div className="stat-label">Countries</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon cities">
                <Icon name="city" />
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.totalCities.toLocaleString()}</div>
                <div className="stat-label">Cities</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon photos">
                <Icon name="camera" />
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.contactsWithPhotos.toLocaleString()}</div>
                <div className="stat-label">With Photos</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon birthdays">
                <Icon name="cake-candles" />
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.contactsWithBirthdays.toLocaleString()}</div>
                <div className="stat-label">With Birthdays</div>
              </div>
            </div>
          </div>
        </section>

        {/* Activity Row */}
        <section className="dashboard-section activity-section">
          <div className="activity-grid">
            {/* Upcoming Birthdays */}
            <div className="dashboard-card">
              <div className="card-header">
                <Icon name="cake-candles" />
                <h2>Upcoming Birthdays</h2>
              </div>
              <div className="card-content">
                {data.upcomingBirthdays.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="calendar-xmark" />
                    <p>No birthdays in the next 7 days</p>
                  </div>
                ) : (
                  <ul className="contact-list">
                    {data.upcomingBirthdays.map((contact) => (
                      <li
                        key={contact.id}
                        className="contact-item"
                        onClick={() => handleContactClick(contact.id)}
                      >
                        <div className="contact-avatar">
                          {getPhotoUrl(contact.photoHash) ? (
                            <img src={getPhotoUrl(contact.photoHash)!} alt="" />
                          ) : (
                            <span className="avatar-placeholder">
                              {contact.displayName.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="contact-info">
                          <div className="contact-name">{contact.displayName}</div>
                          <div className="contact-meta">{contact.birthday}</div>
                        </div>
                        <div className="contact-badge birthday-badge">
                          {formatBirthdayDays(contact.daysUntil)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Recently Added */}
            <div className="dashboard-card">
              <div className="card-header">
                <Icon name="user-plus" />
                <h2>Recently Added</h2>
              </div>
              <div className="card-content">
                {data.recentlyAdded.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="user-slash" />
                    <p>No new contacts in the last 7 days</p>
                  </div>
                ) : (
                  <ul className="contact-list">
                    {data.recentlyAdded.map((contact) => (
                      <li
                        key={contact.id}
                        className="contact-item"
                        onClick={() => handleContactClick(contact.id)}
                      >
                        <div className="contact-avatar">
                          {getPhotoUrl(contact.photoHash) ? (
                            <img src={getPhotoUrl(contact.photoHash)!} alt="" />
                          ) : (
                            <span className="avatar-placeholder">
                              {contact.displayName.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="contact-info">
                          <div className="contact-name">{contact.displayName}</div>
                          <div className="contact-meta">{formatDate(contact.createdAt)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Geography Row */}
        <section className="dashboard-section geography-section">
          <div className="geography-grid">
            {/* Top Countries */}
            <div className="dashboard-card">
              <div className="card-header">
                <Icon name="globe" />
                <h2>Top Countries</h2>
              </div>
              <div className="card-content">
                {data.geography.topCountries.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="map" />
                    <p>No location data available</p>
                  </div>
                ) : (
                  <ul className="geography-list">
                    {data.geography.topCountries.map((item, index) => (
                      <li key={item.country} className="geography-item">
                        <span className="geography-rank">{index + 1}</span>
                        <span className="geography-name">{item.country}</span>
                        <span className="geography-count">{item.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Top Cities */}
            <div className="dashboard-card">
              <div className="card-header">
                <Icon name="city" />
                <h2>Top Cities</h2>
              </div>
              <div className="card-content">
                {data.geography.topCities.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="map" />
                    <p>No location data available</p>
                  </div>
                ) : (
                  <ul className="geography-list">
                    {data.geography.topCities.map((item, index) => (
                      <li key={`${item.city}-${item.country}`} className="geography-item">
                        <span className="geography-rank">{index + 1}</span>
                        <span className="geography-name">
                          {item.city}
                          {item.country && <span className="geography-country">, {item.country}</span>}
                        </span>
                        <span className="geography-count">{item.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <style>{dashboardStyles}</style>
    </div>
  );
}

const dashboardStyles = `
  .dashboard-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .dashboard-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
    background: var(--ds-bg-secondary);
  }

  .dashboard-section {
    margin-bottom: 24px;
  }

  /* Overview Stats Grid */
  .stat-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: var(--ds-bg-primary);
    border-radius: 12px;
    box-shadow: var(--ds-shadow-sm);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--ds-shadow-md);
  }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: var(--ds-color-primary);
    border-radius: 12px;
    color: var(--ds-text-inverse);
  }

  .stat-icon i {
    font-size: 24px;
  }

  .stat-icon.countries { background: var(--ds-color-success); }
  .stat-icon.cities { background: var(--ds-color-warning); }
  .stat-icon.photos { background: var(--ds-color-purple); }
  .stat-icon.birthdays { background: var(--ds-color-error); }

  .stat-info {
    flex: 1;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--ds-text-primary);
    line-height: 1.2;
  }

  .stat-label {
    font-size: 13px;
    color: var(--ds-text-secondary);
    margin-top: 2px;
  }

  /* Activity Grid */
  .activity-grid,
  .geography-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 24px;
  }

  /* Dashboard Cards */
  .dashboard-card {
    background: var(--ds-bg-primary);
    border-radius: 12px;
    box-shadow: var(--ds-shadow-sm);
    overflow: hidden;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--ds-border-color);
  }

  .card-header i {
    font-size: 22px;
    color: var(--ds-color-primary);
  }

  .card-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--ds-text-primary);
  }

  .card-content {
    padding: 8px 0;
  }

  /* Contact List */
  .contact-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .contact-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .contact-item:hover {
    background: var(--ds-bg-secondary);
  }

  .contact-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: var(--ds-border-color);
  }

  .contact-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--ds-color-primary);
    color: var(--ds-text-inverse);
    font-weight: 600;
    font-size: 16px;
  }

  .contact-info {
    flex: 1;
    min-width: 0;
  }

  .contact-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--ds-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .contact-meta {
    font-size: 12px;
    color: var(--ds-text-secondary);
    margin-top: 2px;
  }

  .contact-badge {
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 12px;
    white-space: nowrap;
  }

  .birthday-badge {
    background: var(--ds-color-error-light);
    color: var(--ds-color-error);
  }

  /* Geography List */
  .geography-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .geography-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
  }

  .geography-item:not(:last-child) {
    border-bottom: 1px solid var(--ds-border-light);
  }

  .geography-rank {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ds-border-color);
    border-radius: 50%;
    font-size: 12px;
    font-weight: 600;
    color: var(--ds-text-secondary);
  }

  .geography-name {
    flex: 1;
    font-size: 14px;
    color: var(--ds-text-primary);
  }

  .geography-country {
    color: var(--ds-text-secondary);
  }

  .geography-count {
    font-size: 14px;
    font-weight: 600;
    color: var(--ds-color-primary);
  }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 20px;
    color: var(--ds-text-muted);
  }

  .empty-state i {
    font-size: 40px;
    margin-bottom: 8px;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }

  /* Loading & Error States */
  .dashboard-loading,
  .dashboard-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--ds-text-secondary);
  }

  .dashboard-error i {
    font-size: 48px;
    color: var(--ds-color-error);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--ds-border-color);
    border-top-color: var(--ds-color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile adjustments */
  @media (max-width: 768px) {
    .dashboard-content {
      padding: 16px;
    }

    .stat-cards-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .stat-card {
      padding: 16px;
      gap: 12px;
    }

    .stat-icon {
      width: 40px;
      height: 40px;
    }

    .stat-icon i {
      font-size: 20px;
    }

    .stat-value {
      font-size: 22px;
    }

    .activity-grid,
    .geography-grid {
      grid-template-columns: 1fr;
    }
  }
`;
