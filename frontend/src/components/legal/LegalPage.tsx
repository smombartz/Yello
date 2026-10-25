import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import logoSvg from '../../assets/logo.svg';
import { Button } from '../ui/Button';
import { LandingFooter } from '../landing/LandingFooter';
import { LEGAL, isPlaceholder } from './legalDetails';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

interface LegalPageProps {
  title: string;
  /** A plain-language summary above the full text. */
  summary: ReactNode;
  sections: LegalSection[];
}

/** A legal value, highlighted while it is still a placeholder. */
export function Fill({ value }: { value: string | number }) {
  if (isPlaceholder(value)) {
    return <mark className="legal__placeholder">{value}</mark>;
  }
  return <>{value}</>;
}

/** The contact address as a mailto link, or its placeholder. */
export function ContactEmail() {
  if (isPlaceholder(LEGAL.contactEmail)) return <Fill value={LEGAL.contactEmail} />;
  return <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
}

/**
 * Shared layout for /privacy and /terms: the landing page's nav and footer
 * around one readable column with an "On this page" list. Public, so it works
 * signed in, signed out and inside the desktop app.
 */
export function LegalPage({ title, summary, sections }: LegalPageProps) {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `${title} · Yello`;
    return () => {
      document.title = 'Yello';
    };
  }, [title]);

  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing legal">
      <div ref={topRef} className="lp-sentinel" aria-hidden="true" />

      <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}`}>
        <div className="lp-nav__inner">
          <Link to="/" aria-label="Yello home">
            <img src={logoSvg} alt="Yello" className="lp-nav__logo" width={113} height={24} />
          </Link>
          <div className="lp-nav__actions">
            {isAuthenticated ? (
              <Button variant="secondary" size="sm" onClick={() => navigate('/dashboard')}>
                Open Yello
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={login}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="legal__main">
        <header className="legal__header">
          <p className="legal__eyebrow">Legal</p>
          <h1 className="legal__title">{title}</h1>
          <p className="legal__dates">
            Effective <Fill value={LEGAL.effectiveDate} />
            <span aria-hidden="true"> · </span>
            Last updated {LEGAL.lastUpdated}
          </p>
          <div className="legal__summary">{summary}</div>
        </header>

        <div className="legal__layout">
          <nav className="legal__toc" aria-labelledby="legal-toc-title">
            <p id="legal-toc-title" className="legal__toc-title">On this page</p>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="legal__body">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`}>
                <h2 id={`${section.id}-title`}>
                  <span className="legal__num">{index + 1}.</span> {section.title}
                </h2>
                {section.body}
              </section>
            ))}
          </article>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
