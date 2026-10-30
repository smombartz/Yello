import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useDashboardStats } from '../api/dashboardHooks';
import { Icon } from './Icon';
import { Button } from './ui/Button';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { LaunchBanner } from './LaunchBanner';
import { ContactTileGrid } from './ContactTileGrid';
import { birthdayTile } from '../utils/birthdays';
import { recentTile } from '../utils/recentChanges';

export function DashboardView() {
  const { setHeaderConfig, isMobile } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useDashboardStats();

  useEffect(() => {
    const goToContacts = () => {
      const trimmed = search.trim();
      navigate(trimmed ? `/contacts?q=${encodeURIComponent(trimmed)}` : '/contacts');
    };
    setHeaderConfig({
      title: 'Dashboard',
      search,
      onSearchChange: setSearch,
      onSearchSubmit: goToContacts,
      searchPlaceholder: 'Search contacts...',
      // Phones add from the tab bar's + button
      actions: isMobile ? undefined : (
        <Button
          variant="primary"
          icon="circle-plus"
          onClick={() => navigate('/contacts/new')}
        >
          Add Contact
        </Button>
      ),
    });
  }, [setHeaderConfig, search, navigate, isMobile]);

  if (isLoading) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-loading">
          <LoadingSpinner message="Loading dashboard..." />
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
        <LaunchBanner />

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

            <div className="card stat-card" onClick={() => navigate('/dashboard/birthdays')}>
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
                    <p>No birthdays in the next 14 days</p>
                  </div>
                ) : (
                  <ContactTileGrid tiles={data.upcomingBirthdays.map(birthdayTile)} />
                )}
              </div>
              {data.overview.contactsWithBirthdays > 0 && (
                <Link to="/dashboard/birthdays" className="dashboard-card-footer">
                  See all birthdays
                  <Icon name="chevron-right" />
                </Link>
              )}
            </div>

            {/* Recent: added, imported, synced or updated in the last 7 days */}
            <div className="card dashboard-card">
              <div className="card-header">
                <Icon name="clock-rotate-left" />
                <h2>Recent</h2>
              </div>
              <div className="card-content">
                {data.recent.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="user-slash" />
                    <p>No contacts added or changed in the last 7 days</p>
                  </div>
                ) : (
                  <ContactTileGrid tiles={data.recent.map(recentTile)} />
                )}
              </div>
              <Link to="/dashboard/recent" className="dashboard-card-footer">
                See all recent changes
                <Icon name="chevron-right" />
              </Link>
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

