import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useRecentChanges, type RecentKind } from '../api/dashboardHooks';
import { Icon } from './Icon';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { EmptyState } from './ui/EmptyState';
import { Tabs, type TabItem } from './ui/Tabs';
import { ContactTileGrid } from './ContactTileGrid';
import {
  RECENT_KINDS,
  RECENT_KIND_ICONS,
  RECENT_KIND_LABELS,
  recentTile,
} from '../utils/recentChanges';

/** How far back the page looks. */
const RECENT_DAYS = 30;

type Filter = 'all' | RecentKind;

/**
 * Contacts added, imported, synced, updated or archived in the last 30 days, one card per
 * kind. A contact can show under two kinds (imported, then edited).
 */
export function RecentView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { data, isLoading, error } = useRecentChanges(RECENT_DAYS);

  useEffect(() => {
    setHeaderConfig({
      title: 'Recent changes',
      breadcrumbs: [{ label: 'Dashboard', to: '/dashboard' }],
      search,
      onSearchChange: setSearch,
      searchPlaceholder: 'Search recent changes...',
      info: `Last ${RECENT_DAYS} days`,
    });
  }, [setHeaderConfig, search]);

  const groups = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return RECENT_KINDS
      .filter((kind) => filter === 'all' || filter === kind)
      .map((kind) => ({
        kind,
        total: data.counts[kind],
        changes: data.changes.filter(
          (c) => c.kind === kind && (!query || c.displayName.toLowerCase().includes(query))
        ),
      }))
      .filter((g) => g.changes.length > 0);
  }, [data, filter, search]);

  if (isLoading) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-loading">
          <LoadingSpinner message="Loading recent changes..." />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-error">
          <Icon name="circle-exclamation" />
          <p>Failed to load recent changes</p>
        </div>
      </div>
    );
  }

  const total = RECENT_KINDS.reduce((sum, kind) => sum + data.counts[kind], 0);
  const tabs: TabItem<Filter>[] = [
    { id: 'all', label: 'All', count: total },
    ...RECENT_KINDS.filter((kind) => data.counts[kind] > 0).map((kind) => ({
      id: kind,
      label: RECENT_KIND_LABELS[kind],
      count: data.counts[kind],
    })),
  ];
  const searching = search.trim() !== '';

  return (
    <div className="dashboard-view recent-view">
      <div className="dashboard-content">
        {total === 0 ? (
          <EmptyState
            icon="clock-rotate-left"
            title="Nothing new"
            description={`No contacts were added, imported, synced, updated or archived in the last ${RECENT_DAYS} days.`}
          />
        ) : (
          <>
            <Tabs items={tabs} value={filter} onChange={setFilter} aria-label="Kind of change" />
            {groups.length === 0 ? (
              <EmptyState
                icon="magnifying-glass"
                title="No matches"
                description={`No recent changes match “${search.trim()}”.`}
              />
            ) : (
              groups.map((group) => (
                <section key={group.kind} className="card dashboard-card recent-group">
                  <div className="card-header">
                    <h2 className="recent-group-title">
                      <Icon name={RECENT_KIND_ICONS[group.kind]} />
                      {RECENT_KIND_LABELS[group.kind]}
                    </h2>
                    <span className="recent-group-count">
                      {(searching ? group.changes.length : group.total).toLocaleString()}
                    </span>
                  </div>
                  <ContactTileGrid tiles={group.changes.map(recentTile)} />
                  {!searching && group.total > group.changes.length && (
                    <p className="recent-group-more">
                      Showing the {group.changes.length.toLocaleString()} most recent of{' '}
                      {group.total.toLocaleString()}.
                    </p>
                  )}
                </section>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
