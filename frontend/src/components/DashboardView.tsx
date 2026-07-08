import { useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useDashboardStats } from '../api/dashboardHooks';
import { Icon } from './Icon';

function getPhotoUrl(photoHash: string | null): string | null {
  if (!photoHash) return null;
  return `/photos/small/${photoHash.slice(0, 2)}/${photoHash}.jpg`;
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getOrdinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatBirthday(birthday: string): string {
  let year: number | null = null;
  let month: number;
  let day: number;

  if (birthday.startsWith('--')) {
    const parts = birthday.slice(2).split('-');
    month = parseInt(parts[0], 10);
    day = parseInt(parts[1], 10);
  } else if (birthday.includes('-')) {
    const parts = birthday.split('-');
    if (parts.length === 3) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else {
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
    }
  } else {
    return birthday;
  }

  const monthName = MONTH_NAMES[month! - 1] || '';

  if (year) {
    const now = new Date();
    const thisYear = now.getFullYear();
    const birthdayThisYear = new Date(thisYear, month! - 1, day);
    // Age they will turn on the next occurrence of this birthday
    const age = birthdayThisYear >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
      ? thisYear - year
      : thisYear + 1 - year;
    return `${monthName} ${day}, ${age}${getOrdinalSuffix(age)} Birthday`;
  }

  return `${day} ${monthName}`;
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
      </div>
    );
  }

  return (
    <div className="dashboard-view">
      <div className="dashboard-content">
        {/* Overview Stats Row */}
        <section className="dashboard-section overview-section">
          <div className="stat-cards-grid">
            <div className="card stat-card" onClick={() => navigate('/contacts')}>
              <div className="stat-icon">
                <Icon name="address-book" />
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.totalContacts.toLocaleString()}</div>
                <div className="stat-label">Total Contacts</div>
              </div>
            </div>

            <div className="card stat-card">
              <div className="stat-icon countries">
                <Icon name="globe" />
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.totalCountries.toLocaleString()}</div>
                <div className="stat-label">Countries</div>
              </div>
            </div>

            <div className="card stat-card">
              <div className="stat-icon cities">
                <Icon name="city" />
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.totalCities.toLocaleString()}</div>
                <div className="stat-label">Cities</div>
              </div>
            </div>

            <div className="card stat-card">
              <div className="stat-icon photos">
                <Icon name="camera" />
              </div>
              <div className="stat-info">
                <div className="stat-value">{data.overview.contactsWithPhotos.toLocaleString()}</div>
                <div className="stat-label">With Photos</div>
              </div>
            </div>

            <div className="card stat-card">
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
            <div className="card dashboard-card">
              <div className="card-header">
                <Icon name="cake-candles" />
                <h2>Upcoming Birthdays</h2>
              </div>
              <div className="card-content">
                {data.upcomingBirthdays.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="calendar-xmark" />
                    <p>No birthdays this month or next</p>
                  </div>
                ) : (
                  <ul className="dash-activity-list">
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
                        <div className="dash-activity-info">
                          <div className="dash-activity-name">{contact.displayName}</div>
                          <div className="contact-meta">{formatBirthday(contact.birthday)}</div>
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
            <div className="card dashboard-card">
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
                  <ul className="dash-activity-list">
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
                        <div className="dash-activity-info">
                          <div className="dash-activity-name">{contact.displayName}</div>
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
            <div className="card dashboard-card">
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
            <div className="card dashboard-card">
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

    </div>
  );
}

