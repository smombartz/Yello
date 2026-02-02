import { useState, useEffect } from 'react';
import { Pagination } from './Pagination';
import { useSocialLinksWithinContact, useFixAllSocialLinks } from '../api/socialLinksHooks';

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const PAGE_SIZE = 50;

// Platform icons/colors
const PLATFORM_ICONS: Record<string, string> = {
  linkedin: 'work',
  facebook: 'groups',
  twitter: 'tag',
  instagram: 'photo_camera',
  youtube: 'play_circle',
  tiktok: 'music_note',
  pinterest: 'push_pin',
  snapchat: 'photo_camera',
  reddit: 'forum',
  github: 'code',
  threads: 'forum',
};

export function SocialLinksWithinContact() {
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    data,
    isLoading,
    isFetching,
  } = useSocialLinksWithinContact(currentPage, PAGE_SIZE);

  const fixAllMutation = useFixAllSocialLinks();

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

  const handleFixAll = () => {
    fixAllMutation.mutate(undefined, {
      onSuccess: (result) => {
        const message = `Migrated ${result.migrated} social link${result.migrated !== 1 ? 's' : ''}, removed ${result.deleted} duplicate${result.deleted !== 1 ? 's' : ''}`;

        // Clear any existing toast timeout
        if (toast?.timeout) {
          clearTimeout(toast.timeout);
        }

        // Show success toast
        const timeout = setTimeout(() => setToast(null), 5000);
        setToast({ message, timeout });
      },
    });

    setShowConfirm(false);
  };

  const contacts = data?.contacts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="social-links-loading">
        <span className="material-symbols-outlined spinning">sync</span>
        <p>Finding social URLs in the wrong table...</p>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="social-links-empty">
        <span className="material-symbols-outlined">check_circle</span>
        <p>All social links are properly stored</p>
      </div>
    );
  }

  return (
    <div className="social-links-within-contact">
      <div className="social-links-header">
        <div className="social-links-stats">
          {total} contact{total !== 1 ? 's' : ''} with social links in the URLs table
        </div>
        <button
          className="fix-all-button"
          onClick={() => setShowConfirm(true)}
          disabled={fixAllMutation.isPending}
        >
          <span className="material-symbols-outlined">auto_fix_high</span>
          {fixAllMutation.isPending ? 'Fixing...' : `Fix All (${total})`}
        </button>
      </div>

      <div className="within-contact-list">
        {contacts.map((contact) => (
          <div key={contact.contactId} className="within-contact-item">
            <div className="within-contact-info">
              {contact.photoUrl ? (
                <img
                  src={contact.photoUrl}
                  alt=""
                  className="within-contact-avatar"
                />
              ) : (
                <div className="within-contact-avatar placeholder">
                  <span className="material-symbols-outlined">person</span>
                </div>
              )}
              <div className="within-contact-name">{contact.displayName}</div>
            </div>
            <div className="within-contact-urls">
              {contact.socialUrls.map((su) => (
                <div key={su.id} className="social-url-chip">
                  <span className="material-symbols-outlined">
                    {PLATFORM_ICONS[su.platform] || 'link'}
                  </span>
                  <span className="platform-name">{su.platform}</span>
                  <span className="username">@{su.username}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        isLoading={isFetching}
      />

      {toast && (
        <div className="undo-toast">
          <span className="material-symbols-outlined">check_circle</span>
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

      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Fix All Social Links?</h3>
            <p>
              This will migrate {total} social link{total !== 1 ? 's' : ''} from the URLs table
              to the Social Profiles table, where they belong.
            </p>
            <p className="note-text">
              Links already in Social Profiles will be deduplicated.
            </p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={handleFixAll}
              >
                Fix All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
