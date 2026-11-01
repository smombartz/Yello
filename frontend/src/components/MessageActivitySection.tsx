import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { CHANNEL_ICONS, CHANNEL_LABELS, useContactMessageStats } from '../api/messageHooks';
import { formatDayAgo } from '../utils/relativeTime';

/**
 * A contact's messages across channels (Top contacts): how many, how
 * recently, and on which channel. Hidden when there are none.
 */
export function MessageActivitySection({ contactId }: { contactId: number }) {
  const { data } = useContactMessageStats(contactId);
  if (!data?.total) return null;

  return (
    <div className="expanded-section-view gap-lg message-activity-section">
      <div className="section-heading">
        <div className="section-heading-row">
          <Icon name="comments" />
          <span className="section-heading-label">Messages</span>
        </div>
      </div>
      <p className="message-activity-summary">
        {data.total.toLocaleString()} message{data.total === 1 ? '' : 's'}
        {data.last30Days > 0 && <> · {data.last30Days.toLocaleString()} in the last 30 days</>}
        {data.lastDay && <> · last {formatDayAgo(data.lastDay)}</>}
        {' · '}<Link to="/dashboard/top">Top contacts</Link>
      </p>
      <ul className="message-activity-channels">
        {data.channels.map(c => (
          <li key={c.channel} className={`channel-${c.channel}`} title={c.handles.join(', ')}>
            <span className="match-channel"><Icon name={CHANNEL_ICONS[c.channel].name} style={CHANNEL_ICONS[c.channel].style} /></span>
            <span className="message-activity-channel-name">{CHANNEL_LABELS[c.channel]}</span>
            <span className="message-activity-channel-counts">
              {c.sent.toLocaleString()} sent · {c.received.toLocaleString()} received
              {c.group ? ` · ${c.group.toLocaleString()} in groups` : ''} · last {formatDayAgo(c.lastDay)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
