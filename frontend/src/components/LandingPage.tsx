import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { startDemo } from '../api/client';
import { authKeys, type AuthMeResponse } from '../api/authHooks';
import logoSvg from '../assets/logo.svg';
import { Button } from './ui/Button';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { GoogleMark } from './landing/GoogleMark';
import { SampleBookFrame } from './landing/SampleBookFrame';
import {
  BirthdaysVignette,
  MapVignette,
  MergeVignette,
  PublicCardVignette,
  SourcesVignette,
  VcardVignette,
} from './landing/Vignettes';

type DemoState = 'idle' | 'loading' | 'error';
/** Which action group shows the demo's error, so it is announced once, near the click. */
type DemoOrigin = 'hero' | 'close';

interface ActionsProps {
  onSignIn: () => void;
  onDemo: () => void;
  demoState: DemoState;
  showError: boolean;
}

function SignInActions({ onSignIn, onDemo, demoState, showError }: ActionsProps) {
  return (
    <div className="lp-actions">
      <Button variant="primary" size="lg" className="lp-google-btn" onClick={onSignIn}>
        <GoogleMark />
        Sign in with Google
      </Button>
      <button
        type="button"
        className="lp-text-link"
        onClick={onDemo}
        disabled={demoState === 'loading'}
        aria-busy={demoState === 'loading' || undefined}
      >
        {demoState === 'loading' ? 'Setting up the demo…' : 'Try the demo'}
        <Icon name="arrow-right" />
      </button>
      {showError && (
        <p className="lp-actions__error" role="alert">
          The demo didn{'’'}t start. Try again in a moment.
        </p>
      )}
    </div>
  );
}

interface TileProps {
  id: string;
  title: string;
  body: string;
  size: 'wide' | 'narrow';
  bleed?: boolean;
  children: ReactNode;
}

function Tile({ id, title, body, size, bleed = false, children }: TileProps) {
  return (
    <article className={`lp-tile lp-tile--${size}${bleed ? ' lp-tile--bleed' : ''}`} aria-labelledby={id}>
      <div className="lp-tile__copy">
        <h3 id={id} className="lp-tile__title">{title}</h3>
        <p className="lp-tile__body">{body}</p>
      </div>
      <div className="lp-tile__stage">{children}</div>
    </article>
  );
}

/**
 * The public front door at `/` for signed-out visitors. Every picture on it is
 * real Yello UI filled from the demo book's invented people.
 */
export function LandingPage() {
  const { login } = useAuth();
  const queryClient = useQueryClient();
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [demoOrigin, setDemoOrigin] = useState<DemoOrigin>('hero');
  const [scrolled, setScrolled] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleDemo = async (origin: DemoOrigin) => {
    if (demoState === 'loading') return;
    setDemoOrigin(origin);
    setDemoState('loading');
    try {
      await startDemo();
      // The route above this page redirects to the dashboard once the session
      // lands. If the refetch says we're still signed out, it never will.
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
      const me = queryClient.getQueryData<AuthMeResponse>(authKeys.me);
      if (!me?.isAuthenticated) setDemoState('error');
    } catch {
      setDemoState('error');
    }
  };

  const actionsFor = (origin: DemoOrigin) => (
    <SignInActions
      onSignIn={login}
      onDemo={() => handleDemo(origin)}
      demoState={demoState}
      showError={demoState === 'error' && demoOrigin === origin}
    />
  );

  return (
    <div className="landing">
      <div ref={topRef} className="lp-sentinel" aria-hidden="true" />

      <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}`}>
        <div className="lp-nav__inner">
          <img src={logoSvg} alt="Yello" className="lp-nav__logo" width={113} height={24} />
          <div className="lp-nav__actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDemo('hero')}
              loading={demoState === 'loading'}
            >
              Try the demo
            </Button>
            <Button variant="secondary" size="sm" onClick={login}>
              Sign in
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <h1 id="lp-hero-title" className="lp-display">
            Everyone you know.
            <br />
            One book.
          </h1>
          <p className="lp-lede">
            Yello brings your contacts from iCloud, Google and LinkedIn into one book you own, keeps it
            clean at ten thousand people, and puts the right person one search away.
          </p>
          {actionsFor('hero')}
          <SampleBookFrame onSignIn={login} />
        </section>

        <section className="lp-highlights" aria-labelledby="lp-highlights-title">
          <h2 id="lp-highlights-title" className="lp-headline">Built for big networks.</h2>

          <div className="lp-tiles">
            <Tile
              id="lp-tile-merge"
              size="wide"
              title="One person, one record."
              body="Merge finds the same person across your sources by email, phone, address or social profile. It shows you why before you say yes, and keeps every detail when you do."
            >
              <MergeVignette />
            </Tile>
            <Tile
              id="lp-tile-sources"
              size="narrow"
              title="Every source, one book."
              body="Bring in iCloud, Google Contacts, LinkedIn and any vCard file. Gmail adds the history of what you've written to each other."
            >
              <SourcesVignette />
            </Tile>
            <Tile
              id="lp-tile-birthdays"
              size="narrow"
              title="Remember what matters."
              body="Birthdays, email history and the people around each person, so getting in touch never starts cold."
            >
              <BirthdaysVignette />
            </Tile>
            <Tile
              id="lp-tile-map"
              size="wide"
              bleed
              title="See where everyone is."
              body="Every address lands on a map, so you know who is nearby before you travel."
            >
              <MapVignette />
            </Tile>
            <Tile
              id="lp-tile-card"
              size="wide"
              title="Your card, your choice."
              body="Share your own contact card at a link. Only your name and photo show until you switch more on, one field at a time."
            >
              <PublicCardVignette />
            </Tile>
            <Tile
              id="lp-tile-export"
              size="narrow"
              title="Yours to take."
              body="Every book is its own file. Export it as vCard whenever you like and bring it back with nothing lost. We tested that on a book of 12,116 cards."
            >
              <VcardVignette />
            </Tile>
          </div>

          <p className="lp-also">
            <span className="lp-also__lead">Also in Yello:</span> groups, LinkedIn enrichment, address
            cleanup, link repair, an archive you can restore, a Mac app, and one tap to call, text,
            WhatsApp or email someone from your phone.
          </p>
        </section>

        <section className="lp-note" aria-labelledby="lp-note-title">
          <h2 id="lp-note-title" className="lp-note__title">Why I made Yello</h2>
          <p>
            I know a lot of people, and my address book showed it: 12,116 cards, gathered over years from
            phones, Google, LinkedIn and old exports, with plenty of people in there more than once.
            Finding the right person for an introduction meant searching in four places.
          </p>
          <p>
            I wanted one book for everyone I know. It had to stay quick at that size, keep itself tidy,
            and belong to me, so I could take it anywhere with nothing lost. Yello is that book. I hope
            it holds your people as well as it holds mine.
          </p>
          <div className="lp-note__sign">
            <Avatar photoUrl={null} name="Sascha" size={40} />
            <span>
              <span className="lp-note__name">Sascha</span>
              <span className="lp-note__role">Maker of Yello</span>
            </span>
          </div>
        </section>

        <section className="lp-close" aria-labelledby="lp-close-title">
          <h2 id="lp-close-title" className="lp-headline">Start with the people you already know.</h2>
          <p className="lp-lede">Sign in with Google to make your book, then bring in your first source.</p>
          {actionsFor('close')}
          <p className="lp-close__note">
            The demo is twenty invented contacts for two hours. No account needed.
          </p>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <div className="lp-footer__brand">
            <img src={logoSvg} alt="Yello" width={94} height={20} />
            <p>A personal CRM for people with big networks.</p>
          </div>
          <div className="lp-footer__links">
            <button type="button" className="lp-text-link" onClick={login}>Sign in</button>
            <button
              type="button"
              className="lp-text-link"
              onClick={() => handleDemo('close')}
              disabled={demoState === 'loading'}
            >
              Try the demo
            </button>
          </div>
        </div>
        <div className="lp-footer__fine">
          <span>{'©'} {new Date().getFullYear()} Yello</span>
          <span>Every book is its own SQLite file.</span>
        </div>
      </footer>
    </div>
  );
}
