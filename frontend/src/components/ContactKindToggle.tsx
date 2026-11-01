import { Icon } from './Icon';
import type { ContactKind } from '../api/types';

interface ContactKindToggleProps {
  kind: ContactKind;
  onChange: (kind: ContactKind) => void;
}

const OPTIONS: { value: ContactKind; icon: string; label: string }[] = [
  { value: 'person', icon: 'user', label: 'Person' },
  { value: 'company', icon: 'building', label: 'Company' },
  { value: 'generic', icon: 'address-card', label: 'Generic' },
];

/**
 * Person, Company or Generic. Company is Apple's "Show as Company" and syncs to
 * iCloud; Generic (Front Desk, Support line) is Yello's own and syncs as a
 * normal card. Contacts with a company name but no first or last name start
 * out as Company until the user picks one.
 */
export function ContactKindToggle({ kind, onChange }: ContactKindToggleProps) {
  return (
    <div className="contact-kind-toggle" role="radiogroup" aria-label="Contact type">
      {OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={kind === option.value}
          className={`contact-kind-option${kind === option.value ? ' selected' : ''}`}
          onClick={() => onChange(option.value)}
        >
          <Icon name={option.icon} />
          {option.label}
        </button>
      ))}
    </div>
  );
}
