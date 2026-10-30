import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

export interface ContactTile {
  /** Unique within the grid (a contact can appear twice on some pages, so not always its id) */
  key: string | number;
  contactId: number;
  displayName: string;
  photoHash: string | null;
  /** Bold first line of the tooltip, e.g. "Tomorrow" or "Imported" */
  tipTitle: string;
  /** Second line of the tooltip, e.g. "March 4, 40th Birthday" or "2 days ago" */
  tipText: string;
}

function photoUrl(photoHash: string | null): string | null {
  if (!photoHash) return null;
  return `/photos/small/${photoHash.slice(0, 2)}/${photoHash}.jpg`;
}

interface Tip {
  x: number;
  y: number;
  below: boolean;
  title: string;
  text: string;
}

/** Keeps the tooltip's centre this far from the viewport edges. */
const TIP_EDGE = 110;

/**
 * Contacts as small tiles: photo on top, name underneath, each linking to the contact.
 * Each tile's details show in a tooltip on hover or keyboard focus. The tooltip is
 * portalled to <body> with fixed positioning so card edges and scroll containers never
 * clip it. Used by the Birthdays and Recent cards and pages.
 */
export function ContactTileGrid({ tiles }: { tiles: ContactTile[] }) {
  const [tip, setTip] = useState<Tip | null>(null);

  // A fixed tooltip would drift away from its tile on scroll, so drop it instead.
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [tip]);

  const showTip = (el: HTMLElement, t: ContactTile) => {
    const rect = el.getBoundingClientRect();
    const below = rect.top < 64;
    const x = Math.min(Math.max(rect.left + rect.width / 2, TIP_EDGE), window.innerWidth - TIP_EDGE);
    setTip({ x, y: below ? rect.bottom + 6 : rect.top - 6, below, title: t.tipTitle, text: t.tipText });
  };
  const hideTip = () => setTip(null);

  return (
    <>
      <ul className="contact-tile-grid">
        {tiles.map((t) => {
          const photo = photoUrl(t.photoHash);
          return (
            <li key={t.key}>
              <Link
                to={`/contacts/${t.contactId}`}
                className="contact-tile"
                aria-label={`${t.displayName}, ${t.tipTitle}, ${t.tipText}`}
                onMouseEnter={(e) => showTip(e.currentTarget, t)}
                onMouseLeave={hideTip}
                onFocus={(e) => showTip(e.currentTarget, t)}
                onBlur={hideTip}
              >
                <span className="contact-tile-avatar">
                  {photo ? (
                    <img src={photo} alt="" />
                  ) : (
                    <span className="avatar-placeholder">{t.displayName.charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <span className="contact-tile-name">{t.displayName}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {tip &&
        createPortal(
          <div
            className={`contact-tile-tip${tip.below ? ' below' : ''}`}
            role="tooltip"
            style={{ left: tip.x, top: tip.y }}
          >
            <div className="contact-tile-tip-title">{tip.title}</div>
            <div>{tip.text}</div>
          </div>,
          document.body
        )}
    </>
  );
}
