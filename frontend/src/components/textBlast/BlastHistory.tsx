import { Link } from 'react-router-dom';
import { useBlasts } from '../../api/textBlastHooks';
import { Badge } from '../ui/Badge';
import { Icon } from '../Icon';
import { BLAST_STATUS, summarizeCounts } from './statusLabels';

function formatDate(sqlite: string): string {
  return new Date(`${sqlite.replace(' ', 'T')}Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Past blasts, newest first. */
export function BlastHistory() {
  const { data: blasts } = useBlasts();
  if (!blasts?.length) return null;
  return (
    <section className="settings-group">
      <h2 className="settings-group-title">Past blasts</h2>
      <section className="settings-section">
        <ul className="text-blast-history">
          {blasts.map((b) => (
            <li key={b.id}>
              <Link to={`/tools/text-blast/${b.id}`}>
                <div className="text-blast-history-main">
                  <span className="text-blast-history-text">{b.template}</span>
                  <span className="text-blast-muted">
                    {formatDate(b.createdAt)} · {b.total} people · {summarizeCounts(b.counts)}
                  </span>
                </div>
                {b.simulate && <Badge variant="info">Simulated</Badge>}
                <Badge variant={BLAST_STATUS[b.status].variant}>{BLAST_STATUS[b.status].label}</Badge>
                <Icon name="chevron-right" className="nav-link-arrow" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
