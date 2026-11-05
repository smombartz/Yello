import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Modal as AntModal } from 'antd';
import { useLayoutModal } from '../../hooks/useLayoutModal';

interface ModalProps {
  /** Visible title and accessible name */
  label: string;
  /** Escape, the X and a mask click call this. Omit it for a blocking dialog (e.g. progress). */
  onClose?: () => void;
  /** Pixel width; Ant's default is 520 */
  width?: number;
  className?: string;
  /** Ant footer; leave it out when the body renders its own buttons */
  footer?: ReactNode;
  children: ReactNode;
}

// Mounted Modals, so stacked dialogs keep Layout's "modal open" flag until the last one goes.
let mountedModals = 0;

/**
 * Canonical modal shell on Ant's Modal. Render conditionally
 * (`{open && <Modal …/>}`); it is open for as long as it is mounted.
 *
 * Escape: rc-dialog listens once on window (bubble phase), closes only the
 * topmost dialog, and skips it when `keyboard` is false (non-dismissable).
 * While mounted, Modal tells Layout a modal is open (useLayoutModal) so
 * Layout's own Escape handler doesn't also navigate. The "closed" signal is
 * deferred one tick: rc-dialog's listener may run before Layout's on the same
 * Escape, and a synchronous "closed" could let Layout navigate too.
 *
 * Ant hardcodes role="dialog" + aria-modal + aria-labelledby on its panel,
 * so there is no `role` prop (no alertdialog).
 */
export function Modal({ label, onClose, width, className, footer = null, children }: ModalProps) {
  const { setModalOpen } = useLayoutModal();
  const dismissable = Boolean(onClose);

  useEffect(() => {
    mountedModals += 1;
    setModalOpen(true);
    return () => {
      mountedModals -= 1;
      setTimeout(() => {
        if (mountedModals === 0) setModalOpen(false);
      }, 0);
    };
    // setModalOpen only dispatches a window event; safe to run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AntModal
      open
      title={label}
      onCancel={onClose}
      closable={dismissable}
      keyboard={dismissable}
      mask={{ closable: dismissable }}
      footer={footer}
      width={width}
      className={className}
      destroyOnHidden
    >
      {children}
    </AntModal>
  );
}
