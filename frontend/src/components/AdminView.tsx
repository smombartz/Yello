import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useAdminUsers } from '../api/adminHooks';
import { Icon } from './Icon';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const { data, isLoading, error } = useAdminUsers();

  useEffect(() => {
    setHeaderConfig({ title: 'Admin' });
  }, [setHeaderConfig]);

  if (isLoading) {
    return (
      <div className="admin-view">
        <div className="admin-loading">
          <div className="loading-spinner" />
          <p>Loading users...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="admin-view">
        <div className="admin-error">
          <Icon name="circle-exclamation" />
          <p>{error?.message || 'Failed to load admin data'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-view">
      <div className="admin-content">
        <div className="admin-summary">
          <span className="admin-summary-count">{data.totalUsers}</span> registered user{data.totalUsers !== 1 ? 's' : ''}
        </div>

        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th className="num">Contacts</th>
                <th>Last Login</th>
                <th>Created</th>
                <th className="num">DB Size</th>
                <th className="num">Photos</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="admin-user-cell">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.name || user.email}
                          className="admin-user-avatar"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="admin-user-avatar-placeholder">
                          {(user.name || user.email)[0].toUpperCase()}
                        </div>
                      )}
                      <div className="admin-user-info">
                        <span className="admin-user-name">{user.name || 'Unnamed'}</span>
                        <span className="admin-user-email">{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="num">{user.contactCount.toLocaleString()}</td>
                  <td>{user.lastLogin ? formatDateTime(user.lastLogin) : 'Never'}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td className="num">{formatBytes(user.dbSizeBytes)}</td>
                  <td className="num">
                    {user.photoCount.toLocaleString()}
                    {user.photoSizeBytes > 0 && (
                      <span className="admin-photo-size"> ({formatBytes(user.photoSizeBytes)})</span>
                    )}
                  </td>
                  <td>{user.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

