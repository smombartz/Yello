import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

const DEMO_PROMPT_DELAY_MS = 3 * 60 * 1000; // 3 minutes

export function DemoPromptModal() {
  const { isDemo, login } = useAuth();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isDemo || dismissed) return;

    const timer = setTimeout(() => setShow(true), DEMO_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isDemo, dismissed]);

  if (!show || dismissed) return null;

  return (
    <div className="demo-prompt-overlay">
      <div className="demo-prompt-modal">
        <h3>Enjoying Yello?</h3>
        <p>Sign in with Google to keep your contacts and unlock all features.</p>
        <div className="demo-prompt-actions">
          <button className="demo-prompt-primary" onClick={login}>
            Sign in with Google
          </button>
          <button className="demo-prompt-secondary" onClick={() => setDismissed(true)}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
