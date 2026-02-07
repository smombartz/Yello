import { useNavigate, useOutletContext } from 'react-router-dom';
import { useDashboardStats } from '../api/dashboardHooks';
import { MobileHeader } from './MobileHeader';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

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
  const { isMobile } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useDashboardStats();

  const handleContactClick = (id: number) => {
    navigate(`/contacts/${id}`);
  };

  if (isLoading) {
    return (
      <div className="dashboard-view">
        {isMobile ? (
          <MobileHeader title="Dashboard" />
        ) : (
          <div className="dashboard-header">
            <h1>Dashboard</h1>
          </div>
        )}
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
        {isMobile ? (
          <MobileHeader title="Dashboard" />
        ) : (
          <div className="dashboard-header">
            <h1>Dashboard</h1>
          </div>
        )}
        <div className="dashboard-error">
          <span className="material-symbols-outlined">error</span>
          <p>Failed to load dashboard data</p>
        </div>
        <style>{dashboardStyles}</style>
      </div>
    );
  }

  return (
    <div className="dashboard-view">
      {isMobile ? (
        <MobileHeader title="Dashboard" />
      ) : (
        <div className="dashboard-header">
          <h1>Dashboard</h1>
        </div>
      )}

      <div className="dashboard-content">
        {/* Overview Stats Row */}
        <section className="dashboard-section overview-section">
          <div className="stat-cards-grid">
            <div className="stat-card" onClick={() => navigate('/contacts')}>
              <div className="stat-icon">
                <span className="material-symbols-outlined">contacts</span>
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.totalContacts.toLocaleString()}</div>
                <div className="stat-label">Total Contacts</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon countries">
                <span className="material-symbols-outlined">public</span>
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.totalCountries.toLocaleString()}</div>
                <div className="stat-label">Countries</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon cities">
                <span className="material-symbols-outlined">location_city</span>
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.totalCities.toLocaleString()}</div>
                <div className="stat-label">Cities</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon photos">
                <span className="material-symbols-outlined">photo_camera</span>
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.contactsWithPhotos.toLocaleString()}</div>
                <div className="stat-label">With Photos</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon birthdays">
                <span className="material-symbols-outlined">cake</span>
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
                <span className="material-symbols-outlined">cake</span>
                <h2>Upcoming Birthdays</h2>
              </div>
              <div className="card-content">
                {data.upcomingBirthdays.length === 0 ? (
                  <div className="empty-state">
                    <span className="material-symbols-outlined">event_busy</span>
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
                <span className="material-symbols-outlined">person_add</span>
                <h2>Recently Added</h2>
              </div>
              <div className="card-content">
                {data.recentlyAdded.length === 0 ? (
                  <div className="empty-state">
                    <span className="material-symbols-outlined">group_off</span>
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
                <span className="material-symbols-outlined">public</span>
                <h2>Top Countries</h2>
              </div>
              <div className="card-content">
                {data.geography.topCountries.length === 0 ? (
                  <div className="empty-state">
                    <span className="material-symbols-outlined">map</span>
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
                <span className="material-symbols-outlined">location_city</span>
                <h2>Top Cities</h2>
              </div>
              <div className="card-content">
                {data.geography.topCities.length === 0 ? (
                  <div className="empty-state">
                    <span className="material-symbols-outlined">map</span>
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

  .dashboard-header {
    padding: 24px 32px;
    border-bottom: 1px solid #e2e8f0;
    background: #fff;
  }

  .dashboard-header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: #1a202c;
  }

  .dashboard-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
    background: #f7fafc;
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
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: #667eea;
    border-radius: 12px;
    color: #fff;
  }

  .stat-icon .material-symbols-outlined {
    font-size: 24px;
  }

  .stat-icon.countries { background: #48bb78; }
  .stat-icon.cities { background: #ed8936; }
  .stat-icon.photos { background: #9f7aea; }
  .stat-icon.birthdays { background: #f56565; }

  .stat-info {
    flex: 1;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #1a202c;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 13px;
    color: #718096;
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
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid #e2e8f0;
  }

  .card-header .material-symbols-outlined {
    font-size: 22px;
    color: #667eea;
  }

  .card-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1a202c;
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
    background: #f7fafc;
  }

  .contact-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: #e2e8f0;
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
    background: #667eea;
    color: #fff;
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
    color: #1a202c;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .contact-meta {
    font-size: 12px;
    color: #718096;
    margin-top: 2px;
  }

  .contact-badge {
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 12px;
    white-space: nowrap;
  }

  .birthday-badge {
    background: #fed7d7;
    color: #c53030;
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
    border-bottom: 1px solid #f0f0f0;
  }

  .geography-rank {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e2e8f0;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 600;
    color: #4a5568;
  }

  .geography-name {
    flex: 1;
    font-size: 14px;
    color: #1a202c;
  }

  .geography-country {
    color: #718096;
  }

  .geography-count {
    font-size: 14px;
    font-weight: 600;
    color: #667eea;
  }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 20px;
    color: #a0aec0;
  }

  .empty-state .material-symbols-outlined {
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
    color: #718096;
  }

  .dashboard-error .material-symbols-outlined {
    font-size: 48px;
    color: #f56565;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e2e8f0;
    border-top-color: #667eea;
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

    .stat-icon .material-symbols-outlined {
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
