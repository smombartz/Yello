import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logoSvg from '../../assets/logo.svg';

interface LandingFooterProps {
  /** The page's own actions (sign in, demo), shown beside the brand. */
  actions?: ReactNode;
}

/** The footer of every public page: the landing page and the legal pages. */
export function LandingFooter({ actions }: LandingFooterProps) {
  return (
    <footer className="lp-footer">
      <div className="lp-footer__inner">
        <div className="lp-footer__brand">
          <img src={logoSvg} alt="Yello" width={94} height={20} />
          <p>A personal CRM for people with big networks.</p>
        </div>
        {actions && <div className="lp-footer__links">{actions}</div>}
      </div>
      <div className="lp-footer__fine">
        <span>{'©'} {new Date().getFullYear()} Yello</span>
        <nav className="lp-footer__legal" aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
