import { useNavigate } from 'react-router-dom';
import { BackgroundJobPill } from './BackgroundJobPill';
import { useImportStatus } from '../hooks/useImportStatus';

/**
 * Connects the app-wide import job to the persistent pill. Mounted once in
 * Layout so it outlives every route change.
 */
export function ImportStatusIndicator() {
  const { summary, dismiss } = useImportStatus();
  const navigate = useNavigate();

  if (!summary) return null;

  return (
    <BackgroundJobPill
      job={summary}
      onDismiss={dismiss}
      onOpen={() => navigate('/tools')}
    />
  );
}
