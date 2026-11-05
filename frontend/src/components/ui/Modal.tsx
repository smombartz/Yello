import { useEffect, useRef } from 'react';
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

/**
 * Canonical modal shell on Ant's Modal. Render conditionally
 * (`{open && <Modal …/>}`); it is open for as long as it is mounted.
 * While mounted it tells Layout a modal is open (useLayoutModal), and it
 * handles Escape itself in the capture phase so Layout's global
 * "Escape goes to /contacts" never also fires.
 *
 * Ant hardcodes role="dialog" + aria-modal + aria-labelledby on its panel,
 * so there is no `role` prop (no alertdialog).
 */
export function Modal({ label, onClose, width, className, footer = null, children }: ModalProps) {
  const { setModalOpen } = useLayoutModal();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissable = Boolean(onClose);

  useEffect(() => {
    setModalOpen(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCloseRef.current?.();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      setModalOpen(false);
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
      keyboard={false}
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
