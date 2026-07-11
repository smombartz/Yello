import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

const DISMISS_KEY = 'launchBannerDismissed';

/**
 * Dismissible launch / beta announcement bar shown at the top of the Dashboard.
 * Clicking the bar opens the Welcome page; the "×" dismisses it and the choice
 * is persisted in localStorage so it stays gone across reloads.
 */
export function LaunchBanner() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  if (dismissed) return null;

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div
      className="launch-banner"
      role="button"
      tabIndex={0}
      onClick={() => navigate('/welcome')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate('/welcome');
        }
      }}
    >
      <span className="launch-banner__badge">
        <Icon name="rocket" />
        Beta
      </span>
      <span className="launch-banner__text">
        Yello is live — and still being built. Your suggestions and input shape where it goes next.
      </span>
      <span className="launch-banner__cta">
        Read more
        <Icon name="arrow-right" />
      </span>
      <button
        type="button"
        className="launch-banner__dismiss"
        onClick={dismiss}
        aria-label="Dismiss announcement"
      >
        <Icon name="xmark" />
      </button>
    </div>
  );
}
