import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDesktopTextBlast } from '../../api/textBlastHooks';
import { Icon } from '../Icon';
import { BlastDetail } from './BlastDetail';
import { BlastHistory } from './BlastHistory';
import { Composer } from './Composer';
import { SetupBar } from './SetupBar';

/**
 * Tools › Text Blast: personal 1:1 texts through Apple Messages, sent by the desktop app.
 * /tools/text-blast composes a new blast; /tools/text-blast/:id shows one.
 */
export function TextBlastView() {
  const { id } = useParams();
  const blastId = id ? Number(id) : null;
  const queryClient = useQueryClient();
  const { api, setup, checking, refreshSetup, progress } = useDesktopTextBlast();

  // When a run ends, refresh the lists so final statuses show without waiting for a poll.
  const running = !!progress?.running;
  useEffect(() => {
    if (running) return;
    queryClient.invalidateQueries({ queryKey: ['textBlast'] });
    queryClient.invalidateQueries({ queryKey: ['textBlasts'] });
    queryClient.invalidateQueries({ queryKey: ['textBlastSentToday'] });
  }, [running, queryClient]);

  return (
    <div className="settings-view text-blast-view">
      <div className="settings-content">
        <section className="settings-group">
          <div className="text-blast-heading">
            {blastId !== null && (
              <Link to="/tools/text-blast" className="text-blast-back"><Icon name="arrow-left" /> New blast</Link>
            )}
            <h2 className="settings-group-title">Text Blast</h2>
            <p className="text-blast-muted">
              Personal texts to a list, one conversation per person, sent through Messages on your Mac from your own number.
            </p>
          </div>
          <SetupBar
            available={!!api}
            setup={setup}
            checking={checking}
            onRecheck={() => void refreshSetup(true)}
            onOpenSettings={(pane) => void api?.openSettings(pane)}
          />
        </section>

        <section className="settings-group">
          {blastId !== null && Number.isInteger(blastId) ? (
            <BlastDetail key={blastId} blastId={blastId} desktop={api} progress={progress} />
          ) : (
            <Composer desktop={api} busy={running} />
          )}
        </section>

        {blastId === null && <BlastHistory />}
      </div>
    </div>
  );
}
