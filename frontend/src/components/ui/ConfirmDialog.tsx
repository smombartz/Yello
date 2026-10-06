import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

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
 * Built on Modal, so Escape and overlay clicks cancel.
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
  return (
    <Modal
      label={title}
      role="alertdialog"
      onClose={onCancel}
      className={`confirm-dialog${danger ? ' danger' : ''}`}
    >
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {children}
      <div className="confirm-actions">
        <Button variant="secondary" onClick={onCancel} autoFocus>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
