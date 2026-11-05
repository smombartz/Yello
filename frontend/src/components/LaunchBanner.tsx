import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button } from 'antd';
import { Icon } from './Icon';

const DISMISS_KEY = 'launchBannerDismissed';

/**
 * Dismissible launch / beta announcement bar shown at the top of the Dashboard.
 * Clicking the bar (or its "Read more" button) opens the Welcome page; the close
 * button dismisses it and the choice is persisted in localStorage.
 *
 * Accessibility: the bar itself is not a role="button" (it would contain the
 * Read more and close buttons, which is invalid nesting). The real, focusable
 * "Read more" button is the keyboard path; the bar's onClick is a mouse
 * convenience only. Close sits outside the click target's handler path via
 * stopPropagation.
 */
export function LaunchBanner() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  if (dismissed) return null;

  return (
    <Alert
      banner
      role="region"
      aria-label="Announcement"
      type="info"
      className="launch-banner"
      icon={<Icon name="rocket" />}
      title="Yello is live — and still being built. Your suggestions and input shape where it goes next."
      action={
        <Button
          type="link"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/welcome');
          }}
        >
          Read more <Icon name="arrow-right" />
        </Button>
      }
      closable={{
        'aria-label': 'Dismiss announcement',
        onClose: () => {
          localStorage.setItem(DISMISS_KEY, '1');
          setDismissed(true);
        },
      }}
      onClick={(e) => {
        // Clicks on the close button must not navigate.
        if ((e.target as HTMLElement).closest('.ant-alert-close-icon')) return;
        navigate('/welcome');
      }}
    />
  );
}
