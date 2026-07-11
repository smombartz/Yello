import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { Icon } from './Icon';

interface Section {
  id: string;
  icon: string;
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    id: 'live',
    icon: 'rocket',
    title: "We're live",
    body: "Yello is officially launched and open. It's an address book built for staying on top of your relationships — a place to keep track of everyone you know, and to own your social graph instead of renting it from someone else. Thanks for being here this early.",
  },
  {
    id: 'building',
    icon: 'helmet-safety',
    title: 'Still being built',
    body: "This is very much a beta. Things will change quickly, features are still landing, and you'll run into the occasional rough edge. That's expected — we're shaping it in the open rather than waiting for perfect.",
  },
  {
    id: 'help',
    icon: 'hand-holding-heart',
    title: 'Help us build it',
    body: "The best version of Yello is the one built with you. Tell us what's confusing, what's missing, and what you'd love to see. If you spot content that's wrong, outdated, or shouldn't be here, flag it. Every suggestion, bit of input, and flag is what will make this the best place to stay on top of your relationships.",
  },
];

export function WelcomeView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();

  useEffect(() => {
    setHeaderConfig({ title: 'Welcome' });
  }, [setHeaderConfig]);

  return (
    <div className="welcome-view">
      <div className="welcome-content">
        <header className="welcome-hero">
          <span className="welcome-hero__badge">
            <Icon name="rocket" />
            Now in Beta
          </span>
          <h1 className="welcome-hero__title">Welcome to Yello</h1>
          <p className="welcome-hero__subtitle">
            Your address book for staying on top of relationships and owning your social graph — and we're building it together.
          </p>
        </header>

        <div className="welcome-sections">
          {SECTIONS.map((section) => (
            <section key={section.id} className="welcome-card">
              <span className="welcome-card__icon">
                <Icon name={section.icon} />
              </span>
              <div className="welcome-card__body">
                <h2 className="welcome-card__title">{section.title}</h2>
                <p className="welcome-card__text">{section.body}</p>
              </div>
            </section>
          ))}
        </div>

        <p className="welcome-footnote">
          Have something to share? We're all ears — your input is what builds this place.
        </p>
      </div>
    </div>
  );
}
