import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLayoutModal } from '../../hooks/useLayoutModal';

interface ConfirmDialogProps {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra content rendered between the message and the action buttons */
  children?: ReactNode;
}

/**
 * Shared confirmation dialog. Render conditionally: `{show && <ConfirmDialog .../>}`.
 * Signals Layout via useLayoutModal so the global Escape handler doesn't
 * navigate away while the dialog is open; Escape closes the dialog instead.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const { setModalOpen } = useLayoutModal();

  useEffect(() => {
    setModalOpen(true);
    return () => setModalOpen(false);
    // setModalOpen only dispatches a window event; safe to run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    // Capture phase so this wins over Layout's window-level Escape handler
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className={`modal-content confirm-dialog${danger ? ' danger' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        {children}
        <div className="confirm-actions">
          <button type="button" className="cancel-button" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-button${danger ? ' danger' : ''}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
