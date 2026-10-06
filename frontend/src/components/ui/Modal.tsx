import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLayoutModal } from '../../hooks/useLayoutModal';

interface ModalProps {
  /** Accessible name for the dialog (usually its visible title) */
  label: string;
  /** Close request from Escape or an overlay click. Omit for a
   *  non-dismissable dialog (e.g. a blocking progress modal). */
  onClose?: () => void;
  /** `alertdialog` for confirmations that interrupt the user */
  role?: 'dialog' | 'alertdialog';
  /** Extra classes on the `.modal-content` panel (size, layout) */
  className?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Canonical modal shell: `.modal-overlay` + `.modal-content`.
 * Render conditionally (`{open && <Modal …/>}`). Handles aria-modal, Escape
 * (capture phase, so it beats Layout's global Escape), overlay click,
 * initial focus, and focus restoration. Signals Layout via useLayoutModal.
 */
export function Modal({ label, onClose, role = 'dialog', className = '', children }: ModalProps) {
  const { setModalOpen } = useLayoutModal();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setModalOpen(true);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Respect an autoFocus child; otherwise focus the first control, then the panel
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCloseRef.current?.();
    };
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      setModalOpen(false);
      previouslyFocused?.focus?.();
    };
    // setModalOpen only dispatches a window event; safe to run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className={['modal-content', className].filter(Boolean).join(' ')}
        role={role}
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
