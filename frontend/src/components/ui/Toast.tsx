import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';

type ToastType = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ShowToastOptions {
  type?: ToastType;
  /** Auto-dismiss delay in ms (default 5000) */
  duration?: number;
  /** Optional action button (e.g. Undo) rendered before the dismiss button */
  action?: ToastAction;
}

interface ToastState {
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, options?: ShowToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const TOAST_ICONS: Record<ToastType, string> = {
  success: 'circle-check',
  error: 'circle-exclamation',
  info: 'circle-info',
};

/** App-wide toast. Single toast, last-wins, auto-dismisses. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, options?: ShowToastOptions) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast({ message, type: options?.type ?? 'success', action: options?.action });
    timeoutRef.current = window.setTimeout(() => {
      setToast(null);
      timeoutRef.current = null;
    }, options?.duration ?? 5000);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className={`toast${toast.type !== 'success' ? ` ${toast.type}` : ''}`} role="status">
          <Icon name={TOAST_ICONS[toast.type]} />
          <span className="message">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.action?.onClick();
                dismiss();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" className="dismiss" onClick={dismiss} aria-label="Dismiss">
            <Icon name="xmark" />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
