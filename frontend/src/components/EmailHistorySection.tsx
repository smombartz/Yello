import { useCallback } from 'react';
import { Icon } from './Icon';
import { useContactEmailHistory, useEmailSync, useEmailRefresh } from '../api/emailHooks';

interface EmailHistorySectionProps {
  contactId: number;
  hasEmails: boolean;
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatSyncTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function EmailHistorySection({ contactId, hasEmails }: EmailHistorySectionProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useContactEmailHistory(contactId);

  const syncMutation = useEmailSync();
  const refreshMutation = useEmailRefresh();

  const handleSync = useCallback(() => {
    syncMutation.mutate(contactId, {
      onError: (error: Error) => {
        const msg = error.message || '';
        if (msg.includes('gmail_scope_required')) {
          window.location.href = '/api/auth/google/gmail';
        }
      },
    });
  }, [syncMutation, contactId]);

  const handleRefresh = useCallback(() => {
    refreshMutation.mutate(contactId);
  }, [refreshMutation, contactId]);

  const handleGmailScopeError = useCallback(() => {
    window.location.href = '/api/auth/google/gmail';
  }, []);

  // Check for scope error from sync (shown in UI after a failed attempt)
  const syncError = syncMutation.error as Error | null;
  const isScopeError = syncError?.message?.includes('gmail_scope_required');

  // Don't show if contact has no email addresses
  if (!hasEmails) return null;

  const firstPage = data?.pages[0];
  const lastSyncedAt = firstPage?.lastSyncedAt;
  const stats = firstPage?.stats;
  const allEmails = data?.pages.flatMap(p => p.emails) ?? [];
  const isSyncing = syncMutation.isPending;
  const isRefreshing = refreshMutation.isPending;

  // Never synced state
  if (!isLoading && !lastSyncedAt) {
    return (
      <div className="expanded-section-view gap-lg email-history-section">
        <div className="section-heading">
          <div className="section-heading-row">
            <Icon name="envelope" />
            <span className="section-heading-label">Email History</span>
          </div>
        </div>

        {isScopeError ? (
          <div className="email-history-cta">
            <p>Gmail access is required to sync emails.</p>
            <button className="email-history-sync-btn" onClick={handleGmailScopeError}>
              <Icon name="right-to-bracket" />
              Grant Gmail Access
            </button>
          </div>
        ) : (
          <div className="email-history-cta">
            <p>Sync emails from Gmail to see your conversation history.</p>
            <button
              className="email-history-sync-btn"
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <>
                  <Icon name="arrows-rotate" className="spinning" />
                  Syncing...
                </>
              ) : (
                <>
                  <Icon name="arrows-rotate" />
                  Sync Emails
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="expanded-section-view gap-lg email-history-section">
        <div className="section-heading">
          <div className="section-heading-row">
            <Icon name="envelope" />
            <span className="section-heading-label">Email History</span>
          </div>
        </div>
        <div className="email-history-loading">
          <Icon name="arrows-rotate" className="spinning" />
        </div>
      </div>
    );
  }

  return (
    <div className="expanded-section-view gap-lg email-history-section">
      <div className="section-heading">
        <div className="section-heading-row">
          <Icon name="envelope" />
          <span className="section-heading-label">Email History</span>
          {stats && stats.total > 0 && (
            <span className="email-history-count">{stats.total}</span>
          )}
        </div>
      </div>

      {/* Stats line */}
      {stats && stats.total > 0 && (
        <div className="email-history-stats">
          <span>{stats.total} total</span>
          <span className="email-history-stats-sep">&middot;</span>
          <span>~{stats.avgPerMonth}/month</span>
          <span className="email-history-stats-sep">&middot;</span>
          <span>{stats.last30Days} in last 30 days</span>
        </div>
      )}

      {/* Sync status */}
      {lastSyncedAt && (
        <div className="email-history-sync-status">
          <span>Synced {formatSyncTime(lastSyncedAt)}</span>
          <button
            className="email-history-refresh-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh"
          >
            <Icon name="arrows-rotate" className={isRefreshing ? 'spinning' : ''} />
          </button>
        </div>
      )}

      {/* Email list */}
      {allEmails.length > 0 ? (
        <div className="email-history-list">
          {allEmails.map((email) => (
            <a
              key={email.id}
              href={`https://mail.google.com/mail/u/0/#all/${email.threadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="email-history-item"
            >
              <span className={`email-history-direction ${email.direction}`}>
                <Icon name={email.direction === 'inbound' ? 'arrow-left' : 'arrow-right'} />
              </span>
              <span className="email-history-subject">
                {email.subject || '(no subject)'}
              </span>
              <span className="email-history-date">
                {formatRelativeDate(email.date)}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="email-history-empty">No emails found</div>
      )}

      {/* Load more */}
      {hasNextPage && (
        <button
          className="email-history-load-more"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Show more'}
        </button>
      )}
    </div>
  );
}
