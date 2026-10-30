import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { useAllBirthdays, type UpcomingBirthday } from '../api/dashboardHooks';
import { Icon } from './Icon';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { EmptyState } from './ui/EmptyState';
import { ContactTileGrid } from './ContactTileGrid';
import { MONTH_NAMES, birthdayTile, nextOccurrence } from '../utils/birthdays';

interface MonthGroup {
  key: string;
  label: string;
  birthdays: UpcomingBirthday[];
}

/** Groups (already sorted) birthdays by the month of their next occurrence. */
function groupByMonth(birthdays: UpcomingBirthday[]): MonthGroup[] {
  const thisYear = new Date().getFullYear();
  const groups: MonthGroup[] = [];
  for (const b of birthdays) {
    const date = nextOccurrence(b.daysUntil);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const month = MONTH_NAMES[date.getMonth()];
      group = {
        key,
        label: date.getFullYear() === thisYear ? month : `${month} ${date.getFullYear()}`,
        birthdays: [],
      };
      groups.push(group);
    }
    group.birthdays.push(b);
  }
  return groups;
}

export function BirthdaysView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useAllBirthdays();

  const birthdays = data?.birthdays;
  const total = birthdays?.length ?? 0;

  useEffect(() => {
    setHeaderConfig({
      title: 'Birthdays',
      breadcrumbs: [{ label: 'Dashboard', to: '/dashboard' }],
      search,
      onSearchChange: setSearch,
      searchPlaceholder: 'Search birthdays...',
      info: birthdays ? `${total.toLocaleString()} birthday${total === 1 ? '' : 's'}` : undefined,
    });
  }, [setHeaderConfig, search, birthdays, total]);

  const groups = useMemo(() => {
    if (!birthdays) return [];
    const query = search.trim().toLowerCase();
    const matches = query
      ? birthdays.filter((b) => b.displayName.toLowerCase().includes(query))
      : birthdays;
    return groupByMonth(matches);
  }, [birthdays, search]);

  if (isLoading) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-loading">
          <LoadingSpinner message="Loading birthdays..." />
        </div>
      </div>
    );
  }

  if (error || !birthdays) {
    return (
      <div className="dashboard-view">
        <div className="dashboard-error">
          <Icon name="circle-exclamation" />
          <p>Failed to load birthdays</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-view birthdays-view">
      <div className="dashboard-content">
        {total === 0 ? (
          <EmptyState
            icon="cake-candles"
            title="No birthdays yet"
            description="Add a birthday to a contact and it will show up here."
          />
        ) : groups.length === 0 ? (
          <EmptyState icon="magnifying-glass" title="No matches" description={`No birthdays match “${search.trim()}”.`} />
        ) : (
          groups.map((group) => (
            <section key={group.key} className="card dashboard-card birthdays-month">
              <div className="card-header">
                <h2>{group.label}</h2>
                <span className="birthdays-month-count">{group.birthdays.length}</span>
              </div>
              <ContactTileGrid tiles={group.birthdays.map(birthdayTile)} />
            </section>
          ))
        )}
      </div>
    </div>
  );
}
