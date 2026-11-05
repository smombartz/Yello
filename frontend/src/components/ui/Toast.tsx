import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { App, Button } from 'antd';
import { statusIcons } from '../../theme/antIcons';

type ToastType = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ShowToastOptions {
  type?: ToastType;
  /** Auto-dismiss delay in ms (default 5000). 0 keeps the toast until dismissed (Ant semantics). */
  duration?: number;
  /** Optional action button (e.g. Undo); runs its callback, then closes the toast */
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, options?: ShowToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
/** One toast at a time, last wins (same behaviour as before) */
const TOAST_KEY = 'yello-toast';

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** App-wide toast on Ant's message (plain) or notification (with an action). Single toast, last-wins. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { message, notification } = App.useApp();

  const showToast = useCallback(
    (text: string, options?: ShowToastOptions) => {
      const type = options?.type ?? 'success';
      const duration = (options?.duration ?? 5000) / 1000; // Ant takes seconds
      const action = options?.action;
      if (!action) {
        // The other kind may still be showing under the same key; clear it so only one toast is visible
        notification.destroy(TOAST_KEY);
        message.open({ key: TOAST_KEY, type, icon: statusIcons[type], content: text, duration });
        return;
      }
      // A toast with an action (e.g. Undo) needs a button, which message has no slot for
      message.destroy(TOAST_KEY);
      notification.open({
        key: TOAST_KEY,
        type,
        icon: statusIcons[type],
        title: text,
        duration,
        placement: 'top',
        actions: (
          <Button
            type="link"
            size="small"
            onClick={() => {
              action.onClick();
              notification.destroy(TOAST_KEY);
            }}
          >
            {action.label}
          </Button>
        ),
      });
    },
    [message, notification]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
