import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Button } from './ui/Button';
import { Tabs } from './ui/Tabs';
import { EmptyState } from './ui/EmptyState';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { MessageMatchQueue } from './MessageMatchQueue';
import { MessageSourcesPanel } from './MessageSourcesPanel';
import { formatDayAgo } from '../utils/relativeTime';
import {
  CHANNEL_ICONS, CHANNEL_LABELS, useMessageHandles, useMessageSources, useTopContacts,
  type MessageChannel, type RankMode, type RankWindow, type TopContact,
} from '../api/messageHooks';

type View = 'ranking' | 'match' | 'sources';

const WINDOWS: Array<{ id: RankWindow; label: string }> = [
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '365', label: '1 year' },
  { id: 'all', label: 'All time' },
];

/** Twelve monthly bars, oldest left; the height is relative to the person's busiest month. */
function Sparkline({ months }: { months: number[] }) {
  const max = Math.max(1, ...months);
  return (
    <svg className="top-contact-spark" viewBox="0 0 48 16" aria-hidden="true">
      {months.map((n, i) => {
        const h = n ? Math.max(1.5, (n / max) * 16) : 0.75;
        return <rect key={i} x={i * 4} y={16 - h} width={3} height={h} rx={0.5} className={n ? '' : 'empty'} />;
      })}
    </svg>
  );
}

/** One cell per channel column: that channel's message count, or a dash */
function ChannelCount({ contact, channel }: { contact: TopContact; channel: MessageChannel }) {
  const counts = contact.channels[channel];
  if (!counts) return <span className="top-contact-num muted" aria-label={`${CHANNEL_LABELS[channel]}: none`}>–</span>;
  const total = counts.sent + counts.received + counts.group;
  const detail = `${CHANNEL_LABELS[channel]}: ${counts.sent.toLocaleString()} sent, ${counts.received.toLocaleString()} received`
    + (counts.group ? `, ${counts.group.toLocaleString()} in groups` : '');
  return <span className="top-contact-num" title={detail} aria-label={detail}>{total.toLocaleString()}</span>;
}

function RankingList({ mode, period, channel, search, channels }: {
  mode: RankMode; period: RankWindow; channel: MessageChannel | null; search: string;
  /** Channels with data, one column each */
  channels: MessageChannel[];
}) {
  const { data, isLoading, error } = useTopContacts(mode, period, channel, 200);
  const contacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const ranked = (data?.contacts ?? []).map((c, i) => ({ ...c, rank: i + 1 }));
    return query ? ranked.filter(c => c.displayName.toLowerCase().includes(query)) : ranked;
  }, [data, search]);

  if (isLoading) return <LoadingSpinner message="Ranking contacts..." />;
  if (error) return <EmptyState icon="circle-exclamation" title="Couldn’t load top contacts" description={error.message} />;
  if (!data?.contacts.length) {
    return <EmptyState icon="comments" title="No messages in this period" description="Try a longer period or another channel." />;
  }
  if (!contacts.length) return <EmptyState icon="magnifying-glass" title="No matches" description={`No top contacts match “${search.trim()}”.`} />;

  const columns = channel ? [channel] : channels;
  // Rank, avatar, name, one track per channel, sparkline, value (narrow screens override this in CSS)
  const channelTracks = columns.map(() => '4rem').join(' ');
  const gridStyle = { '--rank-columns': `2rem 36px minmax(0, 1fr) ${channelTracks} 48px 4.5rem` } as CSSProperties;

  return (
    <div className="top-contacts-table" style={gridStyle}>
      <div className="top-contact-row top-contacts-head" aria-hidden="true">
        <span className="top-contact-rank">#</span>
        <span className="top-contacts-head-name">Contact</span>
        {columns.map(ch => (
          <span key={ch} className={`top-contact-num channel-${ch}`} title={CHANNEL_LABELS[ch]}>
            <Icon name={CHANNEL_ICONS[ch].name} style={CHANNEL_ICONS[ch].style} />
          </span>
        ))}
        <span className="top-contact-spark-head" title="Messages per month, last 12 months">12 months</span>
        <span className="top-contact-value" title={mode === 'score' ? 'Recent, two-way conversations count most' : 'Messages in this period'}>
          {mode === 'score' ? 'Score' : 'Messages'}
        </span>
      </div>
      <ol className="top-contacts-list">
        {contacts.map(c => (
          <li key={c.contactId}>
            <Link to={`/contacts/${c.contactId}`} className="top-contact-row">
              <span className="top-contact-rank">{c.rank}</span>
              <Avatar photoUrl={c.photoUrl} name={c.displayName} size={36} />
              <span className="top-contact-main">
                <span className="top-contact-name">{c.displayName}</span>
                <span className="top-contact-detail">
                  {c.sent.toLocaleString()} sent · {c.received.toLocaleString()} received
                  {c.group ? ` · ${c.group.toLocaleString()} in groups` : ''} · last {formatDayAgo(c.lastDay)}
                </span>
              </span>
              {columns.map(ch => <ChannelCount key={ch} contact={c} channel={ch} />)}
              <Sparkline months={c.months} />
              <span className="top-contact-value" title={mode === 'score' ? 'Score: recent, two-way conversations count most' : 'Messages'}>
                {mode === 'score' ? Math.round(c.score).toLocaleString() : c.total.toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TopContactsView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View | null) ?? 'ranking';
  const setView = (v: View) => setParams(p => { p.set('view', v); return p; }, { replace: true });

  const [mode, setMode] = useState<RankMode>('score');
  const [period, setPeriod] = useState<RankWindow>('all');
  const [channel, setChannel] = useState<MessageChannel | null>(null);
  const [search, setSearch] = useState('');

  const sources = useMessageSources();
  const unmatched = useMessageHandles('unmatched', null, 1);
  const activeChannels = (sources.data?.sources ?? []).filter(s => s.messages > 0).map(s => s.channel);
  const hasData = activeChannels.length > 0;

  useEffect(() => {
    setHeaderConfig({
      title: 'Top contacts',
      breadcrumbs: [{ label: 'Dashboard', to: '/dashboard' }],
      ...(view === 'ranking' ? { search, onSearchChange: setSearch, searchPlaceholder: 'Search top contacts...' } : {}),
    });
  }, [setHeaderConfig, search, view]);

  // First visit with nothing imported: start on Sources
  useEffect(() => {
    if (sources.data && !hasData && !params.get('view')) setView('sources');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.data, hasData]);

  return (
    <div className="dashboard-view top-contacts-view">
      <div className="dashboard-content">
        <Tabs
          aria-label="Top contacts"
          value={view}
          onChange={setView}
          items={[
            { id: 'ranking', label: 'Ranking', icon: 'ranking-star' },
            { id: 'match', label: 'Needs a match', icon: 'user-plus', count: unmatched.data?.total || null },
            { id: 'sources', label: 'Sources', icon: 'plug' },
          ]}
        />

        {view === 'ranking' && (
          hasData || sources.isLoading ? (
            <section className="card dashboard-card">
              <div className="top-contacts-controls">
                <div className="segmented" role="radiogroup" aria-label="Rank by">
                  {(['score', 'count'] as const).map(m => (
                    <button
                      key={m} type="button" role="radio" aria-checked={mode === m}
                      className={`segment${mode === m ? ' selected' : ''}`}
                      onClick={() => setMode(m)}
                      title={m === 'score' ? 'Recent, two-way conversations count most' : 'Plain number of messages'}
                    >
                      {m === 'score' ? 'Score' : 'Messages'}
                    </button>
                  ))}
                </div>
                <div className="segmented" role="radiogroup" aria-label="Period">
                  {WINDOWS.map(w => (
                    <button
                      key={w.id} type="button" role="radio" aria-checked={period === w.id}
                      className={`segment${period === w.id ? ' selected' : ''}`}
                      onClick={() => setPeriod(w.id)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
                {activeChannels.length > 1 && (
                  <div className="channel-filter" role="radiogroup" aria-label="Channel">
                    <button
                      type="button" role="radio" aria-checked={channel === null}
                      className={`channel-chip${channel === null ? ' selected' : ''}`}
                      onClick={() => setChannel(null)}
                    >
                      All
                    </button>
                    {activeChannels.map(c => (
                      <button
                        key={c} type="button" role="radio" aria-checked={channel === c}
                        className={`channel-chip${channel === c ? ' selected' : ''}`}
                        onClick={() => setChannel(c)}
                      >
                        <Icon name={CHANNEL_ICONS[c].name} style={CHANNEL_ICONS[c].style} />
                        {CHANNEL_LABELS[c]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <RankingList mode={mode} period={period} channel={channel} search={search} channels={activeChannels} />
              {!!unmatched.data?.total && (
                <button type="button" className="dashboard-card-footer" onClick={() => setView('match')}>
                  {unmatched.data.total.toLocaleString()} {unmatched.data.total === 1 ? 'person isn’t' : 'people aren’t'} matched to a contact yet
                  <Icon name="chevron-right" />
                </button>
              )}
            </section>
          ) : (
            <EmptyState
              icon="comments"
              title="See who you talk to most"
              description="Connect Gmail, iMessage, WhatsApp, Instagram or LinkedIn. Yello counts messages per person (never their text) and ranks your contacts."
              action={<Button variant="primary" icon="plug" onClick={() => setView('sources')}>Connect messages</Button>}
            />
          )
        )}

        {view === 'match' && <MessageMatchQueue />}
        {view === 'sources' && <MessageSourcesPanel />}
      </div>
    </div>
  );
}
