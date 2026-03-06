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
      <style>{`
        .demo-prompt-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .demo-prompt-modal {
          background: white;
          border-radius: 12px;
          padding: 32px;
          max-width: 400px;
          width: 90%;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .demo-prompt-modal h3 {
          margin: 0 0 8px;
          font-size: 20px;
        }
        .demo-prompt-modal p {
          margin: 0 0 24px;
          color: var(--ds-text-secondary);
          font-size: 14px;
        }
        .demo-prompt-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .demo-prompt-primary {
          padding: 12px;
          background: linear-gradient(46deg, #7C3AED 7.03%, #273DE3 94.08%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
        }
        .demo-prompt-primary:hover { opacity: 0.9; }
        .demo-prompt-secondary {
          padding: 12px;
          background: none;
          border: none;
          color: var(--ds-text-muted);
          font-size: 14px;
          cursor: pointer;
        }
        .demo-prompt-secondary:hover { color: var(--ds-text-primary); }
      `}</style>
    </div>
  );
}
