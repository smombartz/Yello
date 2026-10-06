import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from './Layout';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Tabs } from './ui/Tabs';
import { SearchBar } from './ui/SearchBar';
import { FilePicker } from './ui/FilePicker';
import { EmptyState } from './ui/EmptyState';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';
import { ActionMenu } from './ui/ActionMenu';
import { readDesignTokens, contrastRatio, parseColor, type DesignToken } from '../lib/designTokens';

/* ============================================================
 * Content: rules quoted from DESIGN.md (keep in sync with it)
 * ============================================================ */

interface Rule {
  name: string;
  body: string;
}

/** Keyed by the token group each rule governs, so it renders beside that specimen. */
const RULES: Record<string, Rule[]> = {
  Brand: [
    { name: 'The Mark Leads Rule', body: "The UI's primary is the mark's own violet: Signal Violet (#5F27E3) is the logo, favicon, app icon and `--ds-color-primary` alike. There is one violet in the product. Iris appears only inside the front-door gradient." },
    { name: 'The Signal Only Rule', body: 'Violet marks what is active, selected or actionable. It never fills a panel, tints a section header or decorates. If a screen reads as "violet," too much is lit.' },
  ],
  'Front-door gradient': [
    { name: 'The Front Door Rule', body: 'The Iris → Cobalt gradient appears only on surfaces outside the app shell: sign-in, the public card page, onboarding, launch and the demo prompt. Inside the shell there are no gradients, and gradients never sit on text.' },
  ],
  Families: [
    { name: 'The One Family Rule', body: 'Geist only, at weights 400, 500, 600 and 700. Hierarchy comes from size and weight. Never add a second family for display or labels. The system monospace stack (`--ds-font-mono`) is reserved for code, token names and file paths.' },
  ],
  'Size scale': [
    { name: 'The Scale Floor Rule', body: 'Sizes come from the `--ds-font-*` scale (11–30px). The only sanctioned literals are 13px and 15px for compact densities. Nothing a person reads goes below 11px, including tab-bar labels and photo captions.' },
  ],
  Radius: [
    { name: 'The Radius Ladder Rule', body: 'The bigger the surface, the softer the corner: 4 → 6 → 8 → 12 → 16/24. A small control never gets a big radius, and a modal never gets a sharp one.' },
  ],
  Shadows: [
    { name: 'The Float Earns Shadow Rule', body: 'A surface gets a real shadow only when it floats above the desk: overlay, toast or fixed control. Anything in the flow stays at hairline-ambient or below.' },
  ],
  Dimensions: [
    { name: 'The Shared Column Rule', body: "The header's center column and the page content share one 960px column, so the title, search, counts and list edges line up vertically on every page. Never offset one without the other." },
    { name: 'The 32px Rule', body: 'Every control is 32px tall, whether button, input, select, chip or tab pill. Mixing heights on one row is a bug.' },
  ],
};

interface Guidance {
  dos: string[];
  donts: string[];
}

/** Every Do and Don't from DESIGN.md, each placed once beside what it governs. */
const GUIDANCE: Record<string, Guidance> = {
  color: {
    dos: ['Reach for `--ds-color-primary` (Signal Violet, #5F27E3) and `--ds-color-primary-hover` (#530bce) rather than any literal violet.'],
    donts: [
      'Introduce another violet, indigo or purple. Iris (#7c3aed) exists only as the gradient\'s first stop, and the old purple accent token is gone.',
      'Put the brand gradient inside the app shell, or on text. It is for front doors only.',
      'Fill panels, section headers or large areas with violet or Signal Tint. Tint is for selected states.',
      'Set readable text in Pewter (#9ca3af, 2.5:1 on white). It is for icons, dismiss glyphs and disabled states.',
      'Add a dark theme ad hoc. The system is light-only today, and a dark mode needs its own token pass.',
    ],
  },
  type: {
    dos: [],
    donts: ['Add a second typeface or set text off the `--ds-font-*` scale.'],
  },
  depth: {
    dos: ['Separate surfaces with 1px Hairline Rule borders and tone. Let a card lift on hover with the 16px ambient shadow.'],
    donts: ['Give in-flow cards anything heavier than the hairline ambient shadow at rest.'],
  },
  motion: {
    dos: ['Write transitions with the duration and easing tokens (`var(--ds-duration-normal) var(--ds-easing-default)`), never literal seconds.'],
    donts: [],
  },
  layout: {
    dos: [
      'Align new pages to the shared 960px column so the header title, search and content edges line up.',
      'Use the existing `--ds-*` tokens and the four breakpoints (640/768/1024/1280) only.',
    ],
    donts: [],
  },
  'component-tokens': {
    dos: [],
    donts: ['Redefine a canonical class (`.btn`, `.tab`, `.modal-content`, `.card`) in a page stylesheet. Page CSS loads globally, so the override leaks app-wide.'],
  },
  buttons: {
    dos: [
      'Reach for the primitives in `components/ui/` first: `<Button>` for actions, `<Tabs>` for tab bars, `<Modal>`/`<ConfirmDialog>` for overlays, `<LoadingSpinner>` and `<EmptyState>` for waiting and empty views, `<Badge>` for status.',
      'Keep exactly one filled primary button per view. Everything else is secondary, ghost or icon.',
      'Build every control at 32px (`--ds-control-height`), with 6px corners and 14px medium labels.',
    ],
    donts: [
      'Fill a button with Success green or Info blue, or fade a button with opacity on hover.',
      'Invent a new button class or restyle `button` elements by descendant selector. Extend `<Button>` with a variant or size instead.',
    ],
  },
  fields: {
    dos: ['Use Graphite (#6b7280) or darker for any text a person must read, placeholders included.'],
    donts: [],
  },
  'contact-row': {
    dos: ['Show selection the same way everywhere: a 2px Signal Violet ring on the card and a violet check badge on the avatar.'],
    donts: [],
  },
  avatars: {
    dos: ['Let people carry the color. Use real photos where present, and otherwise the name-hashed initial avatar.'],
    donts: [],
  },
};

/* ============================================================
 * Token sections
 * ============================================================ */

type Specimen =
  | 'swatch'
  | 'gradient'
  | 'text-color'
  | 'surface'
  | 'border'
  | 'family'
  | 'font-size'
  | 'weight'
  | 'leading'
  | 'space'
  | 'radius'
  | 'shadow'
  | 'duration'
  | 'easing'
  | 'breakpoint'
  | 'z'
  | 'measure'
  | 'value';

interface TokenGroup {
  title: string;
  match: RegExp;
  specimen: Specimen;
  note?: string;
}

interface FoundationSection {
  id: string;
  title: string;
  lead: string;
  groups: TokenGroup[];
}

const FOUNDATIONS: FoundationSection[] = [
  {
    id: 'color',
    title: 'Color',
    lead: 'A neutral gray desk with a single violet signal. Color appears where meaning does: state, action and status. The people on the page supply the rest.',
    groups: [
      { title: 'Brand', match: /^--ds-color-primary/, specimen: 'swatch' },
      { title: 'Front-door gradient', match: /^--ds-gradient-brand$/, specimen: 'gradient' },
      { title: 'Gradient stops', match: /^--ds-gradient-brand-(from|to)$/, specimen: 'swatch' },
      { title: 'Text', match: /^--ds-text-/, specimen: 'text-color', note: 'Sample name. Contrast is measured live against the ground each token is used on; readable text needs AA (4.5:1).' },
      { title: 'Surfaces', match: /^--ds-bg-/, specimen: 'surface' },
      { title: 'Borders', match: /^--ds-border-/, specimen: 'border' },
      { title: 'Status', match: /^--ds-color-(error|success|warning|info)/, specimen: 'swatch' },
      { title: 'Third-party', match: /^--ds-color-whatsapp/, specimen: 'swatch', note: 'WhatsApp reach-out actions only.' },
      { title: 'Merge confidence', match: /^--ds-confidence-/, specimen: 'swatch', note: 'Only in the Merge view.' },
    ],
  },
  {
    id: 'type',
    title: 'Typography',
    lead: 'One neo-grotesque doing every job. Names are the content; the type around them is plumbing.',
    groups: [
      { title: 'Families', match: /^--ds-font-(family|mono)$/, specimen: 'family' },
      { title: 'Size scale', match: /^--ds-font-(2xs|xs|sm|md|lg|xl|2xl|3xl)$/, specimen: 'font-size' },
      { title: 'Weights', match: /^--ds-weight-/, specimen: 'weight', note: 'Sample name and company.' },
      { title: 'Line height', match: /^--ds-leading-/, specimen: 'leading' },
    ],
  },
  {
    id: 'space',
    title: 'Spacing',
    lead: 'A 4px grid. 8px and 16px do most of the work, 12px separates list rows and 24px separates sections.',
    groups: [{ title: 'Scale', match: /^--ds-space-/, specimen: 'space' }],
  },
  {
    id: 'shape',
    title: 'Shape',
    lead: 'Gently curved, never pillowy. Borders are 1px hairlines; a 2px line only marks the active tab, focus and selection.',
    groups: [{ title: 'Radius', match: /^--ds-radius-/, specimen: 'radius' }],
  },
  {
    id: 'depth',
    title: 'Depth',
    lead: 'Flat, but softer. Surfaces separate by hairline and tone; real shadows belong to things that float.',
    groups: [{ title: 'Shadows', match: /^--ds-shadow-/, specimen: 'shadow' }],
  },
  {
    id: 'motion',
    title: 'Motion',
    lead: 'Quick and functional, with no choreography. Normal (150ms) is the default for every state change.',
    groups: [
      { title: 'Durations', match: /^--ds-duration-/, specimen: 'duration' },
      { title: 'Easing', match: /^--ds-easing-/, specimen: 'easing' },
    ],
  },
  {
    id: 'layout',
    title: 'Layout',
    lead: 'A fixed 64px header, a floating icon rail and one centered 960px column shared by header and content.',
    groups: [
      { title: 'Dimensions', match: /^--ds-(control-height|content-width|layout-gap|nav-|header-)/, specimen: 'measure', note: 'Drawn at true size; widths past the column are capped.' },
      { title: 'Breakpoints', match: /^--ds-bp-/, specimen: 'breakpoint', note: '768px is the app-shell switch: below it the rail gives way to the bottom tab bar.' },
      { title: 'Stacking', match: /^--ds-z-/, specimen: 'z' },
    ],
  },
  {
    id: 'component-tokens',
    title: 'Component tokens',
    lead: 'Semantic aliases the primitives are built on. Change the alias, and every instance follows.',
    groups: [{ title: 'Aliases', match: /^--ds-(btn|input|card|modal)-/, specimen: 'measure' }],
  },
];

const COMPONENT_SECTIONS = [
  { id: 'buttons', title: 'Buttons' },
  { id: 'badges', title: 'Badges' },
  { id: 'tabs', title: 'Tabs and chips' },
  { id: 'fields', title: 'Fields' },
  { id: 'contact-row', title: 'Contact row' },
  { id: 'avatars', title: 'Avatars' },
  { id: 'feedback', title: 'Feedback' },
  { id: 'overlays', title: 'Overlays' },
];

/* ============================================================
 * Small pieces
 * ============================================================ */

/** Renders `code` spans inside rule and guidance text. */
function InlineText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>
      )}
    </>
  );
}

function RuleNotes({ rules }: { rules?: Rule[] }) {
  if (!rules?.length) return null;
  return (
    <div className="sg-rules">
      {rules.map((rule) => (
        <p key={rule.name} className="sg-rule">
          <strong>{rule.name}.</strong> <InlineText text={rule.body} />
        </p>
      ))}
    </div>
  );
}

function GuidanceList({ guidance }: { guidance?: Guidance }) {
  if (!guidance) return null;
  return (
    <ul className="sg-guidance">
      {guidance.dos.map((text) => (
        <li key={text} className="sg-guidance-item is-do">
          <Icon name="check" />
          <span><strong>Do</strong> <InlineText text={text} /></span>
        </li>
      ))}
      {guidance.donts.map((text) => (
        <li key={text} className="sg-guidance-item is-dont">
          <Icon name="xmark" />
          <span><strong>Don't</strong> <InlineText text={text} /></span>
        </li>
      ))}
    </ul>
  );
}

function CodeLine({ children }: { children: string }) {
  return <pre className="sg-code"><code>{children}</code></pre>;
}

/** Copies `var(--token)` and confirms with the app's toast. */
function useCopyToken() {
  const { showToast } = useToast();
  return async (name: string) => {
    const text = `var(${name})`;
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${text}`, { duration: 2000 });
    } catch {
      showToast("Couldn't copy to clipboard", { type: 'error' });
    }
  };
}

function TokenMeta({ token }: { token: DesignToken }) {
  return (
    <span className="sg-token-meta">
      <span className="sg-token-name">{token.name}</span>
      <span className="sg-token-value">
        {token.alias ? <>→ {token.alias} · {token.value}</> : token.value}
      </span>
    </span>
  );
}

/* ============================================================
 * Specimens
 * ============================================================ */

function ContrastBadge({ ratio }: { ratio: number | null }) {
  if (ratio === null) return null;
  const label = ratio.toFixed(1) + ':1';
  if (ratio >= 4.5) return <Badge variant="success">{label} AA</Badge>;
  if (ratio >= 3) return <Badge variant="warning">{label} large only</Badge>;
  return <Badge variant="neutral">{label} not text</Badge>;
}

const LENGTH = /^-?[\d.]+(px|rem|em|%)$/;

/** A true-size visual for dimension and alias tokens, chosen from name and resolved value. */
function MeasureSample({ token }: { token: DesignToken }) {
  const v = `var(${token.name})`;
  const n = token.name;
  if (/radius/.test(n)) return <span className="sg-mini-radius" style={{ borderRadius: v }} />;
  if (/shadow/.test(n)) return <span className="sg-mini-shadow" style={{ boxShadow: v }} />;
  if (/(font-size|title-size)$/.test(n)) return <span className="sg-measure-text" style={{ fontSize: v }}>Contacts</span>;
  if (/font-weight$/.test(n)) return <span className="sg-measure-text" style={{ fontWeight: v }}>Save changes</span>;
  if (/(height|icon-size|logo-size)$/.test(n)) {
    return <span className="sg-measure-box" style={{ height: v, width: /size$/.test(n) ? v : undefined }} />;
  }
  if (LENGTH.test(token.value)) return <span className="sg-measure-bar" style={{ width: `min(${v}, 100%)` }} />;
  if (parseColor(token.value)) return <span className="sg-mini-chip" style={{ background: v }} />;
  return null;
}

function TokenSpecimen({ token, specimen, onCopy, paper, accent = '' }: {
  token: DesignToken;
  specimen: Specimen;
  onCopy: (name: string) => void;
  paper: string;
  /** Ground for inverse text tokens (Signal Violet) */
  accent?: string;
}) {
  const v = `var(${token.name})`;
  const copyLabel = `Copy var(${token.name})`;

  switch (specimen) {
    case 'swatch':
    case 'surface':
      return (
        <button type="button" className="sg-swatch" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className={`sg-swatch-chip${specimen === 'surface' ? ' is-surface' : ''}`} style={{ background: v }} />
          <TokenMeta token={token} />
        </button>
      );
    case 'border':
      return (
        <button type="button" className="sg-swatch" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-swatch-chip is-border" style={{ borderColor: v }} />
          <TokenMeta token={token} />
        </button>
      );
    case 'gradient':
      return (
        <button type="button" className="sg-gradient" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-gradient-strip" style={{ background: v }} />
          <TokenMeta token={token} />
        </button>
      );
    case 'text-color': {
      // Inverse text lives on filled controls, so it is shown and measured on Signal Violet
      const inverse = token.name.includes('inverse');
      return (
        <button type="button" className="sg-row" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-row-sample">
            <span className={`sg-text-sample${inverse ? ' is-inverse' : ''}`} style={{ color: v }}>Maya Rosen</span>
          </span>
          <TokenMeta token={token} />
          <ContrastBadge ratio={contrastRatio(token.value, inverse ? accent : paper)} />
        </button>
      );
    }
    case 'measure':
      return (
        <button type="button" className="sg-row" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-row-sample sg-measure"><MeasureSample token={token} /></span>
          <TokenMeta token={token} />
        </button>
      );
    case 'family':
      return (
        <button type="button" className="sg-row sg-row--tall" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-row-sample sg-family-sample" style={{ fontFamily: v }}>
            Aa Bb Cc 0123456789
          </span>
          <TokenMeta token={token} />
        </button>
      );
    case 'font-size':
      return (
        <button type="button" className="sg-row" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-row-sample sg-size-sample" style={{ fontSize: v }}>Find the right person</span>
          <TokenMeta token={token} />
        </button>
      );
    case 'weight':
      return (
        <button type="button" className="sg-row" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-row-sample sg-weight-sample" style={{ fontWeight: v }}>Maya Rosen · Northfield Studio</span>
          <TokenMeta token={token} />
        </button>
      );
    case 'leading':
      return (
        <button type="button" className="sg-row sg-row--tall" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-row-sample sg-leading-sample" style={{ lineHeight: v }}>
            Every source flows into one record per person, so the same friend is never scattered across apps.
          </span>
          <TokenMeta token={token} />
        </button>
      );
    case 'space':
      return (
        <button type="button" className="sg-row" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-row-sample"><span className="sg-space-bar" style={{ width: v }} /></span>
          <TokenMeta token={token} />
        </button>
      );
    case 'radius':
      return (
        <button type="button" className="sg-swatch" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-radius-tile" style={{ borderRadius: v }} />
          <TokenMeta token={token} />
        </button>
      );
    case 'shadow':
      return (
        <button type="button" className="sg-swatch sg-swatch--shadow" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <span className="sg-shadow-tile" style={{ boxShadow: v }} />
          <TokenMeta token={token} />
        </button>
      );
    default:
      return (
        <button type="button" className="sg-row" onClick={() => onCopy(token.name)} aria-label={copyLabel}>
          <TokenMeta token={token} />
        </button>
      );
  }
}

const GRID_SPECIMENS: Specimen[] = ['swatch', 'surface', 'border', 'radius', 'shadow'];

/** Motion tracks: each runner crosses its track using the token itself. */
function MotionGroup({ tokens, kind, onCopy }: { tokens: DesignToken[]; kind: 'duration' | 'easing'; onCopy: (name: string) => void }) {
  const [played, setPlayed] = useState(false);
  return (
    <div className="sg-sheet">
      <div className="sg-motion-head">
        <Button size="sm" icon={played ? 'rotate-left' : 'play'} onClick={() => setPlayed((p) => !p)}>
          {played ? 'Reset' : 'Play'}
        </Button>
        <span className="sg-motion-hint">
          {kind === 'duration' ? 'Each track uses its duration with the default easing.' : 'Each track runs 600ms so the curve is visible.'}
        </span>
      </div>
      {tokens.map((token) => {
        const style: CSSProperties =
          kind === 'duration'
            ? { transitionDuration: `var(${token.name})`, transitionTimingFunction: 'var(--ds-easing-default)' }
            : { transitionDuration: '600ms', transitionTimingFunction: `var(${token.name})` };
        return (
          <div key={token.name} className="sg-motion-row">
            <button type="button" className="sg-motion-label" onClick={() => onCopy(token.name)} aria-label={`Copy var(${token.name})`}>
              <TokenMeta token={token} />
            </button>
            <span className={`sg-motion-track${played ? ' is-played' : ''}`}>
              <span className="sg-motion-runner" style={style}>
                <span className="sg-motion-dot" />
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BreakpointRuler({ tokens, onCopy }: { tokens: DesignToken[]; onCopy: (name: string) => void }) {
  const max = 1440;
  return (
    <div className="sg-sheet">
      <div className="sg-ruler" aria-hidden="true">
        {tokens.map((token) => (
          <span key={token.name} className="sg-ruler-mark" style={{ left: `${(parseFloat(token.value) / max) * 100}%` }}>
            <span className="sg-ruler-label">{token.value}</span>
          </span>
        ))}
        <span className="sg-ruler-end">1440px</span>
      </div>
      <div className="sg-rows">
        {tokens.map((token) => (
          <TokenSpecimen key={token.name} token={token} specimen="value" onCopy={onCopy} paper="" />
        ))}
      </div>
    </div>
  );
}

function StackingList({ tokens, onCopy }: { tokens: DesignToken[]; onCopy: (name: string) => void }) {
  const sorted = [...tokens].sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
  const max = Math.max(...sorted.map((t) => parseFloat(t.value) || 0), 1);
  return (
    <div className="sg-sheet sg-rows">
      {sorted.map((token) => (
        <button key={token.name} type="button" className="sg-row" onClick={() => onCopy(token.name)} aria-label={`Copy var(${token.name})`}>
          <span className="sg-row-sample"><span className="sg-z-bar" style={{ width: `${(parseFloat(token.value) / max) * 100}%` }} /></span>
          <TokenMeta token={token} />
        </button>
      ))}
    </div>
  );
}

function TokenGroupView({ group, tokens, onCopy, paper, accent, showRules }: {
  group: TokenGroup;
  tokens: DesignToken[];
  onCopy: (name: string) => void;
  paper: string;
  accent: string;
  showRules: boolean;
}) {
  let body: ReactNode;
  if (group.specimen === 'duration' || group.specimen === 'easing') {
    body = <MotionGroup tokens={tokens} kind={group.specimen} onCopy={onCopy} />;
  } else if (group.specimen === 'breakpoint') {
    body = <BreakpointRuler tokens={tokens} onCopy={onCopy} />;
  } else if (group.specimen === 'z') {
    body = <StackingList tokens={tokens} onCopy={onCopy} />;
  } else if (group.specimen === 'gradient') {
    body = tokens.map((token) => (
      <TokenSpecimen key={token.name} token={token} specimen="gradient" onCopy={onCopy} paper={paper} accent={accent} />
    ));
  } else {
    const grid = GRID_SPECIMENS.includes(group.specimen);
    body = (
      <div className={`sg-sheet ${grid ? 'sg-grid' : 'sg-rows'}${group.specimen === 'shadow' ? ' sg-grid--shadow' : ''}`}>
        {tokens.map((token) => (
          <TokenSpecimen key={token.name} token={token} specimen={group.specimen} onCopy={onCopy} paper={paper} accent={accent} />
        ))}
      </div>
    );
  }

  return (
    <div className="sg-group">
      <div className="sg-group-head">
        <h3>{group.title}</h3>
        {group.note && <p className="sg-group-note">{group.note}</p>}
      </div>
      {showRules && <RuleNotes rules={RULES[group.title]} />}
      {body}
    </div>
  );
}

/* ============================================================
 * Component specimens
 * ============================================================ */

const BUTTON_VARIANTS = ['primary', 'secondary', 'danger', 'ghost'] as const;

function ButtonsSpecimen() {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const demoSave = () => {
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      showToast('Saved (style guide demo)', { duration: 2000 });
    }, 1400);
  };

  return (
    <>
      <div className="sg-sheet sg-matrix" role="table" aria-label="Button variants">
        <div className="sg-matrix-row sg-matrix-head" role="row">
          <span role="columnheader">Variant</span>
          <span role="columnheader">Default</span>
          <span role="columnheader">Small</span>
          <span role="columnheader">Disabled</span>
          <span role="columnheader">Loading</span>
        </div>
        {BUTTON_VARIANTS.map((variant) => (
          <div key={variant} className="sg-matrix-row" role="row">
            <code role="cell">{variant}</code>
            <span role="cell"><Button variant={variant} icon="check">Save</Button></span>
            <span role="cell"><Button variant={variant} size="sm" icon="check">Save</Button></span>
            <span role="cell"><Button variant={variant} disabled>Save</Button></span>
            <span role="cell"><Button variant={variant} icon="check" loading>Saving…</Button></span>
          </div>
        ))}
        <div className="sg-matrix-row" role="row">
          <code role="cell">icon</code>
          <span role="cell" className="sg-inline">
            <Button variant="icon" icon="pen-to-square" aria-label="Edit" />
            <Button variant="icon" icon="xmark" aria-label="Close" />
          </span>
          <span role="cell" />
          <span role="cell"><Button variant="icon" icon="pen-to-square" aria-label="Edit" disabled /></span>
          <span role="cell" />
        </div>
      </div>
      <div className="sg-try">
        <Button variant="primary" icon="floppy-disk" loading={saving} onClick={demoSave}>
          {saving ? 'Saving…' : 'Try loading'}
        </Button>
        <span className="sg-try-hint">Click: <code>loading</code> swaps the icon, disables the button and sets <code>aria-busy</code>.</span>
      </div>
      <CodeLine>{'<Button variant="primary" size="sm" icon="check" loading={isSaving}>Save</Button>'}</CodeLine>
      <p className="sg-note">
        A link that has to look like a button uses the same classes: <code>className="btn btn--secondary"</code>.
      </p>
    </>
  );
}

function BadgesSpecimen() {
  return (
    <>
      <div className="sg-sheet sg-inline sg-inline--wrap">
        <Badge variant="neutral">Archived</Badge>
        <Badge variant="brand">Public</Badge>
        <Badge variant="success">Geocoded</Badge>
        <Badge variant="warning">Needs review</Badge>
        <Badge variant="error">Invalid link</Badge>
        <Badge variant="info">From iCloud</Badge>
        <Badge variant="count">128</Badge>
      </div>
      <CodeLine>{'<Badge variant="success">Geocoded</Badge>'}</CodeLine>
    </>
  );
}

type SampleTab = 'recommended' | 'email' | 'phone';

const SAMPLE_CHIPS = ['All', 'Missing email', 'No photo'];
const SAMPLE_SUBTABS = [
  { label: 'Duplicates', icon: 'clone', count: 12 },
  { label: 'Geocoding', icon: 'location-crosshairs', count: 48 },
];

function TabsSpecimen() {
  const [tab, setTab] = useState<SampleTab>('recommended');
  const [chip, setChip] = useState(SAMPLE_CHIPS[0]);
  const [subtab, setSubtab] = useState(SAMPLE_SUBTABS[0].label);
  return (
    <>
      <div className="sg-sheet">
        <Tabs<SampleTab>
          aria-label="Sample matching strategy"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'recommended', label: 'Recommended', icon: 'wand-magic-sparkles', count: 42 },
            { id: 'email', label: 'Email', icon: 'envelope', count: 17 },
            { id: 'phone', label: 'Phone', icon: 'phone', count: 9 },
          ]}
        />
        <p className="sg-note">Sample counts. Focus a tab and use the arrow keys, Home and End.</p>
      </div>
      <div className="sg-sheet sg-stack">
        <div className="sg-inline sg-inline--wrap" role="group" aria-label="Sample filter chips">
          {SAMPLE_CHIPS.map((label) => (
            <button
              key={label}
              type="button"
              className={`cleanup-filter-chip${chip === label ? ' active' : ''}`}
              aria-pressed={chip === label}
              onClick={() => setChip(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="sg-inline sg-inline--wrap" role="group" aria-label="Sample subtab pills">
          {SAMPLE_SUBTABS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`address-subtab${subtab === item.label ? ' active' : ''}`}
              aria-pressed={subtab === item.label}
              onClick={() => setSubtab(item.label)}
            >
              <Icon name={item.icon} />
              {item.label}
              <span className="subtab-badge">{item.count}</span>
            </button>
          ))}
        </div>
        <p className="sg-note">
          Filter chips (<code>.cleanup-filter-chip</code>) and subtab pills (<code>.address-subtab</code>) are class
          patterns, not primitives yet. Sample labels and counts.
        </p>
      </div>
      <CodeLine>{'<Tabs items={items} value={mode} onChange={setMode} aria-label="Matching strategy" />'}</CodeLine>
    </>
  );
}

function FieldsSpecimen() {
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <div className="sg-sheet sg-fields">
        <label className="sg-field">
          <span className="sg-field-label">Search</span>
          <SearchBar value={query} onChange={setQuery} placeholder="Search contacts" />
        </label>
        <label className="sg-field">
          <span className="sg-field-label">Text input</span>
          <input className="edit-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Company" />
        </label>
        <label className="sg-field">
          <span className="sg-field-label">Disabled</span>
          <input className="edit-input" disabled placeholder="Company" />
        </label>
        <div className="sg-field">
          <span className="sg-field-label">File picker</span>
          <FilePicker id="sg-file" accept=".vcf,text/vcard" file={file} onChange={setFile} prompt="Choose a .vcf file" />
        </div>
      </div>
      <CodeLine>{'<SearchBar value={q} onChange={setQ} placeholder="Search contacts" />'}</CodeLine>
    </>
  );
}

const SAMPLE_ROWS = [
  { name: 'Maya Rosen', role: 'Partner \u2022 Northfield Studio', email: 'maya@example.com', phone: '+1 415 555 0142' },
  { name: 'Tomás Okafor', role: 'Producer \u2022 Low Tide Films', email: 'tomas@example.com', phone: '+44 20 7946 0958' },
];

function ContactRowSpecimen() {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<string[]>(['Maya Rosen']);
  const toggle = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  const demo = (what: string) => () => showToast(`${what} (style guide demo)`, { duration: 1800 });

  return (
    <>
      <div className="contact-list">
        {SAMPLE_ROWS.map((row) => {
          const isSelected = selected.includes(row.name);
          return (
            <div key={row.name} className={`card contact-card${isSelected ? ' selected' : ''}`}>
              <div className="collapsed-content">
                <div className="contact-card-main">
                  <Avatar
                    photoUrl={null}
                    name={row.name}
                    size={48}
                    selectable
                    isSelected={isSelected}
                    onToggleSelect={() => toggle(row.name)}
                  />
                  <div className="contact-info">
                    <h3 className="contact-name">{row.name}</h3>
                    <p className="contact-role">{row.role}</p>
                  </div>
                </div>
                <div className="contact-details">
                  <div className="contact-detail-item"><Icon name="envelope" /><span>{row.email}</span></div>
                  <div className="contact-detail-item"><Icon name="phone" /><span>{row.phone}</span></div>
                </div>
                <div className="contact-card-actions">
                  <span className="contact-action-icon">
                    <a href="https://example.com" target="_blank" rel="noopener noreferrer" aria-label={`Website for ${row.name} (sample)`}>
                      <Icon name="globe" />
                    </a>
                  </span>
                  <ActionMenu
                    label={`Actions for ${row.name}`}
                    triggerClassName="contact-action-icon"
                    items={[
                      { label: 'Edit', icon: 'pen', onSelect: demo('Edit') },
                      { label: 'Copy link', icon: 'link', onSelect: demo('Copy link') },
                      { label: 'Archive', icon: 'box-archive', dividerBefore: true, onSelect: demo('Archive') },
                    ]}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="sg-note">
        Sample contacts (example.com addresses, 555 numbers). Click an avatar to toggle selection; the row menu is the
        real <code>ActionMenu</code>.
      </p>
      <CodeLine>{'<ContactRow contact={c} isExpanded={open} onToggle={toggle} selectionEnabled isSelected={sel} />'}</CodeLine>
    </>
  );
}

const SAMPLE_PEOPLE = ['Maya Rosen', 'Tomás Okafor', 'Lena Varga', 'Idris Haddad', 'Noor Sato', 'Felix Brandt'];

function AvatarsSpecimen() {
  return (
    <>
      <div className="sg-sheet">
        <div className="sg-inline sg-inline--wrap">
          {SAMPLE_PEOPLE.map((name) => (
            <span key={name} className="sg-avatar">
              <Avatar photoUrl={null} name={name} size={48} />
              <span className="sg-avatar-name">{name}</span>
            </span>
          ))}
        </div>
        <p className="sg-note">Sample names. Initials sit on a hue hashed from the name, so the same person is always the same color.</p>
      </div>
      <CodeLine>{'<Avatar photoUrl={contact.photoUrl} name={contact.displayName} size={48} />'}</CodeLine>
    </>
  );
}

function FeedbackSpecimen() {
  const { showToast } = useToast();
  return (
    <>
      <div className="sg-sheet sg-feedback">
        <div className="sg-feedback-cell">
          <span className="sg-field-label">Loading</span>
          <div className="sg-inline">
            <LoadingSpinner size={24} />
            <LoadingSpinner size={32} />
            <LoadingSpinner size={40} />
          </div>
        </div>
        <div className="sg-feedback-cell">
          <span className="sg-field-label">Toast</span>
          <div className="sg-inline sg-inline--wrap">
            <Button size="sm" onClick={() => showToast('Contact saved', { duration: 2500 })}>Success</Button>
            <Button size="sm" onClick={() => showToast("Couldn't reach Google", { type: 'error', duration: 2500 })}>Error</Button>
            <Button
              size="sm"
              onClick={() => showToast('3 contacts archived', { action: { label: 'Undo', onClick: () => showToast('Restored (demo)', { duration: 1500 }) } })}
            >
              With action
            </Button>
          </div>
        </div>
        <div className="sg-feedback-empty">
          <EmptyState
            icon="address-book"
            title="No contacts yet"
            description="Import a VCF file or connect Google to start your book."
            action={<Button variant="primary" icon="file-import">Import contacts</Button>}
          />
        </div>
      </div>
      <CodeLine>{'<EmptyState icon="address-book" title="No contacts yet" description="…" action={<Button …/>} />'}</CodeLine>
    </>
  );
}

function OverlaysSpecimen() {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { showToast } = useToast();
  return (
    <>
      <div className="sg-sheet sg-inline sg-inline--wrap">
        <Button icon="window-maximize" onClick={() => setModalOpen(true)}>Open modal</Button>
        <Button icon="triangle-exclamation" onClick={() => setConfirmOpen(true)}>Open confirm dialog</Button>
        <span className="sg-try-hint">Escape or a click outside closes them; focus returns to the button.</span>
      </div>
      <CodeLine>{'{open && <Modal label="Merge contacts" onClose={close} className="merge-conflict-modal">…</Modal>}'}</CodeLine>

      {modalOpen && (
        <Modal label="Sample modal" onClose={() => setModalOpen(false)} className="sg-modal">
          <h3>Sample modal</h3>
          <p>Every overlay renders through Modal: aria-modal, Escape, outside click, initial focus and focus return.</p>
          <div className="sg-modal-actions">
            <Button variant="primary" onClick={() => setModalOpen(false)}>Done</Button>
          </div>
        </Modal>
      )}
      {confirmOpen && (
        <ConfirmDialog
          title="Delete 3 contacts?"
          message="This is a style guide demo; nothing will be deleted."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            showToast('Nothing deleted (demo)', { duration: 2000 });
          }}
        />
      )}
    </>
  );
}

const COMPONENT_BODIES: Record<string, { lead: string; render: () => ReactNode; source: string }> = {
  buttons: { lead: 'Refined and restrained: bordered by default, one filled action per view, every control 32px tall.', render: () => <ButtonsSpecimen />, source: 'components/ui/Button.tsx' },
  badges: { lead: 'Tinted status labels with the family’s darker text, plus round count pills.', render: () => <BadgesSpecimen />, source: 'components/ui/Badge.tsx' },
  tabs: { lead: 'The underline tab bar: Graphite labels, the active tab in Signal Violet with a 2px underline.', render: () => <TabsSpecimen />, source: 'components/ui/Tabs.tsx' },
  fields: { lead: 'Inputs share the 32px height; focus shifts the border to violet and adds the tint halo.', render: () => <FieldsSpecimen />, source: 'components/ui/SearchBar.tsx · FilePicker.tsx · .edit-input' },
  'contact-row': { lead: 'The core repeated unit of the desk: avatar, bold name, two detail columns and a hairline-divided action strip.', render: () => <ContactRowSpecimen />, source: 'components/ContactRow.tsx · ui/ActionMenu.tsx' },
  avatars: { lead: 'People supply the color: the one place the desk is allowed to be multicolored.', render: () => <AvatarsSpecimen />, source: 'components/Avatar.tsx' },
  feedback: { lead: 'Waiting, confirming and empty states, all from shared primitives.', render: () => <FeedbackSpecimen />, source: 'components/ui/LoadingSpinner.tsx · Toast.tsx · EmptyState.tsx' },
  overlays: { lead: 'Overlays float, so they earn the modal shadow over a 50% black scrim.', render: () => <OverlaysSpecimen />, source: 'components/ui/Modal.tsx · ConfirmDialog.tsx' },
};

/* ============================================================
 * Page
 * ============================================================ */

export function StyleGuideView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  // Stylesheets load before the app script runs, so the tokens are readable on first render
  const [tokens] = useState<DesignToken[]>(readDesignTokens);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState('color');
  const copyToken = useCopyToken();

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => (q ? tokens.filter((t) => t.name.includes(q) || t.value.toLowerCase().includes(q)) : tokens),
    [tokens, q]
  );
  const paper = tokens.find((t) => t.name === '--ds-bg-primary')?.value ?? '#ffffff';
  const accent = tokens.find((t) => t.name === '--ds-color-primary')?.value ?? '#5F27E3';

  const foundations = FOUNDATIONS.map((section) => ({
    ...section,
    groups: section.groups
      .map((group) => ({ group, tokens: visible.filter((t) => group.match.test(t.name)) }))
      .filter((g) => g.tokens.length > 0),
  })).filter((section) => section.groups.length > 0);

  // Any token no section claims still renders, so the page can't silently miss one.
  const claimed = (name: string) => FOUNDATIONS.some((s) => s.groups.some((g) => g.match.test(name)));
  const unclaimed = visible.filter((t) => !claimed(t.name));

  const tocFoundations = [
    ...foundations.map((s) => ({ id: s.id, title: s.title })),
    ...(unclaimed.length ? [{ id: 'other-tokens', title: 'Other tokens' }] : []),
  ];
  const tocComponents = q ? [] : COMPONENT_SECTIONS;
  const tocKey = [...tocFoundations, ...tocComponents].map((s) => s.id).join('|');

  useEffect(() => {
    setHeaderConfig({
      title: 'Style guide',
      breadcrumbs: [{ label: 'Admin', to: '/admin' }],
      search: query,
      onSearchChange: setQuery,
      searchPlaceholder: 'Filter tokens',
      info: tokens.length ? (q ? `${visible.length} of ${tokens.length} tokens` : `${tokens.length} tokens`) : undefined,
    });
  }, [setHeaderConfig, query, q, tokens.length, visible.length]);

  // Highlight the section nearest the top of the viewport in the contents rail.
  useEffect(() => {
    const ids = tocKey.split('|').filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActiveId(hit.target.id);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [tocKey]);

  const jumpTo = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
    history.replaceState(null, '', `#${id}`);
  };

  const nothingMatches = q && foundations.length === 0 && unclaimed.length === 0;

  return (
    <div className="docs-view sg-view">
      <div className="docs-layout">
        <div className="docs-main">
          {!q && (
            <p className="docs-intro">
              The live Yello design system, <strong>The Connector's Desk</strong>: neutral furniture, one violet
              signal, and people supplying the color. Every swatch, size and specimen here renders from the shipped{' '}
              <code>--ds-*</code> tokens and <code>components/ui</code> primitives, so this page can't drift from the
              app. Click any token to copy it; the rules are quoted from <code>DESIGN.md</code>.
            </p>
          )}

          {nothingMatches && (
            <EmptyState
              icon="magnifying-glass"
              title="No tokens match"
              description={<>Nothing is named or valued like “{query}”. Try a role such as <code>primary</code>, <code>space</code> or <code>radius</code>.</>}
              action={<Button onClick={() => setQuery('')}>Clear filter</Button>}
            />
          )}

          {foundations.map((section) => (
            <section key={section.id} id={section.id} className="sg-section" aria-labelledby={`${section.id}-title`}>
              <header className="sg-section-head">
                <h2 id={`${section.id}-title`}>{section.title}</h2>
                {!q && <p className="sg-section-lead">{section.lead}</p>}
              </header>
              {section.groups.map(({ group, tokens: groupTokens }) => (
                <TokenGroupView
                  key={group.title}
                  group={group}
                  tokens={groupTokens}
                  onCopy={copyToken}
                  paper={paper}
                  accent={accent}
                  showRules={!q}
                />
              ))}
              {!q && <GuidanceList guidance={GUIDANCE[section.id]} />}
            </section>
          ))}

          {unclaimed.length > 0 && (
            <section id="other-tokens" className="sg-section" aria-labelledby="other-tokens-title">
              <header className="sg-section-head">
                <h2 id="other-tokens-title">Other tokens</h2>
                <p className="sg-section-lead">Tokens no section claims yet. Give them a home above when they settle.</p>
              </header>
              <div className="sg-sheet sg-rows">
                {unclaimed.map((token) => (
                  <TokenSpecimen key={token.name} token={token} specimen="value" onCopy={copyToken} paper={paper} accent={accent} />
                ))}
              </div>
            </section>
          )}

          {!q && COMPONENT_SECTIONS.map(({ id, title }) => {
            const body = COMPONENT_BODIES[id];
            return (
              <section key={id} id={id} className="sg-section" aria-labelledby={`${id}-title`}>
                <header className="sg-section-head">
                  <h2 id={`${id}-title`}>{title}</h2>
                  <p className="sg-section-lead">{body.lead}</p>
                  <span className="sg-source">{body.source}</span>
                </header>
                {body.render()}
                <GuidanceList guidance={GUIDANCE[id]} />
              </section>
            );
          })}
        </div>

        <aside className="docs-toc" aria-label="Style guide contents">
          <nav className="docs-toc-inner">
            <p className="docs-toc-title">On this page</p>
            {[
              { label: 'Foundations', items: tocFoundations },
              { label: 'Components', items: tocComponents },
            ]
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.label} className="docs-toc-group">
                  <span className="docs-toc-group-label">{g.label}</span>
                  <ul>
                    {g.items.map((item) => (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          className={`docs-toc-link${activeId === item.id ? ' active' : ''}`}
                          aria-current={activeId === item.id ? 'location' : undefined}
                          onClick={(e) => jumpTo(e, item.id)}
                        >
                          {item.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}
