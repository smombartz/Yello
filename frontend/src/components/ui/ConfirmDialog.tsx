import type { ReactNode } from 'react';
import { Typography } from 'antd';
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
 * Built on Modal, so Escape, the X and a mask click cancel.
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
      onClose={onCancel}
      width={400}
      footer={[
        <Button key="cancel" variant="secondary" onClick={onCancel} autoFocus>
          {cancelLabel}
        </Button>,
        <Button
          key="ok"
          variant={danger ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Button>,
      ]}
    >
      {message && <Typography.Paragraph>{message}</Typography.Paragraph>}
      {children}
    </Modal>
  );
}
