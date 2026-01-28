import { useState, useCallback, useEffect } from 'react';
import {
  useUserSettings,
  useUpdateUserSettings,
  useDeleteAllContacts,
  exportAllContacts
} from '../api/settingsHooks';

interface SettingsViewProps {
  onBack: () => void;
}

interface ToastState {
  message: string;
  type: 'success' | 'error';
  timeout: ReturnType<typeof setTimeout>;
}

export function SettingsView({ onBack: _onBack }: SettingsViewProps) {
  const { data: settings, isLoading } = useUserSettings();
  const updateMutation = useUpdateUserSettings();
  const deleteMutation = useDeleteAllContacts();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    avatarUrl: '',
    website: '',
    linkedinUrl: '',
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  // Sync form with loaded settings
  useEffect(() => {
    if (settings) {
      setFormData({
        name: settings.name ?? '',
        email: settings.email ?? '',
        phone: settings.phone ?? '',
        avatarUrl: settings.avatarUrl ?? '',
        website: settings.website ?? '',
        linkedinUrl: settings.linkedinUrl ?? '',
      });
    }
  }, [settings]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toast?.timeout) {
      clearTimeout(toast.timeout);
    }
    const timeout = setTimeout(() => setToast(null), 5000);
    setToast({ message, type, timeout });
  }, [toast]);

  const handleInputChange = useCallback((field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSaveProfile = useCallback(() => {
    updateMutation.mutate({
      name: formData.name || null,
      email: formData.email || null,
      phone: formData.phone || null,
      avatarUrl: formData.avatarUrl || null,
      website: formData.website || null,
      linkedinUrl: formData.linkedinUrl || null,
    }, {
      onSuccess: () => {
        showToast('Profile saved successfully', 'success');
      },
      onError: () => {
        showToast('Failed to save profile', 'error');
      }
    });
  }, [formData, updateMutation, showToast]);

  const handleExport = useCallback(() => {
    exportAllContacts();
    showToast('Export started - check your downloads', 'success');
  }, [showToast]);

  const handleDeleteAll = useCallback(() => {
    if (deleteConfirmText !== 'DELETE') return;

    deleteMutation.mutate(undefined, {
      onSuccess: (result) => {
        showToast(`Deleted ${result.deletedCount} contacts`, 'success');
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
      },
      onError: () => {
        showToast('Failed to delete contacts', 'error');
      }
    });
  }, [deleteConfirmText, deleteMutation, showToast]);

  if (isLoading) {
    return (
      <div className="settings-view">
        <div className="settings-loading">
          <span className="material-symbols-outlined spinning">sync</span>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-content">
        {/* Profile Section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="material-symbols-outlined">person</span>
            <h2>Profile</h2>
          </div>
          <div className="settings-section-content">
            <div className="settings-form">
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your@email.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div className="form-group">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleInputChange('website', e.target.value)}
                  placeholder="https://yourwebsite.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="linkedin">LinkedIn</label>
                <input
                  id="linkedin"
                  type="url"
                  value={formData.linkedinUrl}
                  onChange={(e) => handleInputChange('linkedinUrl', e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                />
              </div>
              <div className="form-group">
                <label htmlFor="avatar">Avatar URL</label>
                <input
                  id="avatar"
                  type="url"
                  value={formData.avatarUrl}
                  onChange={(e) => handleInputChange('avatarUrl', e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>
              <button
                className="save-button"
                onClick={handleSaveProfile}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </section>

        {/* Export Section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="material-symbols-outlined">download</span>
            <h2>Export Data</h2>
          </div>
          <div className="settings-section-content">
            <p className="settings-description">
              Download all your contacts as a VCF file that can be imported into other applications.
            </p>
            <button className="export-button" onClick={handleExport}>
              <span className="material-symbols-outlined">download</span>
              Export All Contacts (VCF)
            </button>
          </div>
        </section>

        {/* Danger Zone Section */}
        <section className="settings-section danger-zone">
          <div className="settings-section-header">
            <span className="material-symbols-outlined">warning</span>
            <h2>Danger Zone</h2>
          </div>
          <div className="settings-section-content">
            <div className="danger-item">
              <div className="danger-info">
                <h3>Delete All Contacts</h3>
                <p>Permanently delete all contacts from the database. This action cannot be undone.</p>
              </div>
              <button
                className="danger-button"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete All Contacts
              </button>
            </div>
          </div>
        </section>
      </div>

      {toast && (
        <div className={`undo-toast ${toast.type === 'error' ? 'error' : ''}`}>
          <span className="material-symbols-outlined">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span className="message">{toast.message}</span>
          <button
            className="dismiss"
            onClick={() => {
              if (toast.timeout) clearTimeout(toast.timeout);
              setToast(null);
            }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-dialog danger" onClick={(e) => e.stopPropagation()}>
            <h3>Delete All Contacts?</h3>
            <p>
              This will permanently delete <strong>all contacts</strong> from the database.
              This action cannot be undone.
            </p>
            <p className="confirm-instruction">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="confirm-input"
            />
            <div className="confirm-actions">
              <button
                className="cancel-button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </button>
              <button
                className="confirm-button danger"
                onClick={handleDeleteAll}
                disabled={deleteConfirmText !== 'DELETE' || deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete All Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
