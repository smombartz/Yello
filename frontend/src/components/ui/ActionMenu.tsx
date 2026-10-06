import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon';

export interface ActionMenuItem {
  label: string;
  icon: string;
  /** In-app path. Renders a link, so Cmd/Ctrl-click opens it in a new tab. */
  to?: string;
  onSelect?: () => void;
  /** Draw a divider above this item */
  dividerBefore?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Accessible name for the trigger and the menu, e.g. "Actions for Jane Doe" */
  label: string;
  triggerClassName?: string;
  triggerIcon?: string;
}

const GAP = 4;   // px between trigger and menu
const EDGE = 8;  // px the menu keeps from the viewport edge

/**
 * Icon button that opens a menu of actions. The menu is portaled to <body> with
 * fixed positioning, so an overflow:hidden card or a transformed virtual row
 * can't clip it. Closes on outside click, Escape, Tab, scroll and resize.
 */
export function ActionMenu({
  items,
  label,
  triggerClassName = '',
  triggerIcon = 'ellipsis-vertical',
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Below the trigger with right edges aligned, flipped above when it won't fit.
  // A layout effect, so the menu is never painted at its unpositioned spot.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu || !triggerRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const { width, height } = menu.getBoundingClientRect();
    const fitsBelow = trigger.bottom + GAP + height <= window.innerHeight - EDGE;
    const top = fitsBelow ? trigger.bottom + GAP : trigger.top - GAP - height;
    const left = Math.min(trigger.right - width, window.innerWidth - width - EDGE);
    menu.style.top = `${Math.max(EDGE, top)}px`;
    menu.style.left = `${Math.max(EDGE, left)}px`;
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Capture phase, so Layout's window-level Escape handler doesn't navigate away
        e.stopPropagation();
        close(true);
      }
    };
    // The menu is fixed-position, so any scroll would leave it detached from its trigger
    const handleViewportChange = () => close(false);

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [open, close]);

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const index = menuItems.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (e.key) {
      case 'ArrowDown': next = index + 1 >= menuItems.length ? 0 : index + 1; break;
      case 'ArrowUp': next = index <= 0 ? menuItems.length - 1 : index - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = menuItems.length - 1; break;
      case 'Tab':
        e.preventDefault();
        close(true);
        return;
      default:
        return;
    }
    e.preventDefault();
    menuItems[next]?.focus();
  };

  const handleSelect = (item: ActionMenuItem) => {
    close(true);
    item.onSelect?.();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        <Icon name={triggerIcon} />
      </button>

      {open && createPortal(
        // React events bubble through portals to the trigger's ancestors (a clickable
        // card, say), so stop clicks here as well as on the trigger.
        <div
          ref={menuRef}
          id={menuId}
          className="action-menu"
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map(item => (
            <Fragment key={item.label}>
              {item.dividerBefore && <div className="action-menu-divider" role="separator" />}
              {item.to ? (
                <Link
                  to={item.to}
                  className="action-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => close(false)}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className="action-menu-item"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => handleSelect(item)}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </button>
              )}
            </Fragment>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
