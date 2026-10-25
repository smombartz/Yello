import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Icon } from './Icon';
import { RemoteBackupsContent } from './RemoteBackupsContent';
import { CutoverPreviewContent } from './CutoverPreviewContent';
import type { OutletContext } from './Layout';

/**
 * The move from Apple and Google Contacts to Yello: back up both address
 * books, then preview, review and make the switch.
 */
export function MigrationView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [backupsExpanded, setBackupsExpanded] = useState(false);

  useEffect(() => {
    setHeaderConfig({ title: 'Migration' });
  }, [setHeaderConfig]);

  return (
    <div className="settings-view">
      <div className="settings-content">
        <section className="settings-group">
          <h2 className="settings-group-title">1 · Back up</h2>
          <section className={`settings-section collapsible-card${backupsExpanded ? ' expanded' : ''}`}>
            <button className="collapsible-header" onClick={() => setBackupsExpanded(!backupsExpanded)}>
              <div className="settings-section-header">
                <Icon name="box-archive" />
                <h2>Back up Apple &amp; Google contacts</h2>
              </div>
              <Icon name="chevron-down" className={`expand-icon${backupsExpanded ? ' rotated' : ''}`} />
            </button>
            {backupsExpanded && (
              <div className="collapsible-content">
                <RemoteBackupsContent />
              </div>
            )}
          </section>
        </section>

        <section className="settings-group">
          <h2 className="settings-group-title">2 · Preview and switch</h2>
          <section className="settings-section">
            <div className="settings-section-header">
              <Icon name="magnifying-glass-chart" />
              <h2>Preview the switch to Yello</h2>
            </div>
            <div className="settings-section-content">
              <CutoverPreviewContent />
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
