import { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { Pagination } from './Pagination';
import { useSocialLinksWithinContact, useFixAllSocialLinks } from '../api/socialLinksHooks';

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

const PAGE_SIZE = 50;

// Platform icons - brands style for FA brand icons
const PLATFORM_ICONS: Record<string, { name: string; style?: 'solid' | 'regular' | 'brands' }> = {
  linkedin: { name: 'linkedin', style: 'brands' },
  facebook: { name: 'facebook', style: 'brands' },
  twitter: { name: 'x-twitter', style: 'brands' },
  instagram: { name: 'instagram', style: 'brands' },
  youtube: { name: 'youtube', style: 'brands' },
  tiktok: { name: 'tiktok', style: 'brands' },
  pinterest: { name: 'pinterest', style: 'brands' },
  snapchat: { name: 'snapchat', style: 'brands' },
  reddit: { name: 'reddit', style: 'brands' },
  github: { name: 'github', style: 'brands' },
  threads: { name: 'threads', style: 'brands' },
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
        <Icon name="arrows-rotate" className="spinning" />
        <p>Finding social URLs in the wrong table...</p>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="social-links-empty">
        <Icon name="circle-check" />
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
          <Icon name="wand-magic-sparkles" />
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
                  <Icon name="user" />
                </div>
              )}
              <div className="within-contact-name">{contact.displayName}</div>
            </div>
            <div className="within-contact-urls">
              {contact.socialUrls.map((su) => (
                <div key={su.id} className="social-url-chip">
                  <Icon
                    name={PLATFORM_ICONS[su.platform]?.name || 'link'}
                    style={PLATFORM_ICONS[su.platform]?.style}
                  />
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
          <Icon name="circle-check" />
          <span className="message">{toast.message}</span>
          <button
            className="dismiss"
            onClick={() => {
              if (toast.timeout) clearTimeout(toast.timeout);
              setToast(null);
            }}
          >
            <Icon name="xmark" />
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
