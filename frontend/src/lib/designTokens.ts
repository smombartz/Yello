/**
 * Runtime reader for the `--ds-*` design tokens.
 *
 * Walks the document's stylesheets for `:root` declarations instead of keeping
 * a hand-written list, so the style guide always renders exactly what ships in
 * `styles/design-system.css`, including tokens added later.
 */

export interface DesignToken {
  /** Custom property name, e.g. `--ds-color-primary` */
  name: string;
  /** Value as declared, e.g. `var(--ds-color-primary)` */
  raw: string;
  /** Computed value with every `var()` resolved */
  value: string;
  /** Set when the token is a pure alias of another token */
  alias?: string;
}

function collectRootDeclarations(rules: CSSRuleList, into: Map<string, string>) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      if (rule.selectorText !== ':root') continue;
      for (let i = 0; i < rule.style.length; i++) {
        const prop = rule.style[i];
        if (prop.startsWith('--ds-')) into.set(prop, rule.style.getPropertyValue(prop).trim());
      }
    } else if (rule instanceof CSSImportRule) {
      if (rule.styleSheet) collectRootDeclarations(rule.styleSheet.cssRules, into);
    } else if ('cssRules' in rule) {
      collectRootDeclarations((rule as CSSGroupingRule).cssRules, into);
    }
  }
}

/** Every `--ds-*` token in declaration order. */
export function readDesignTokens(): DesignToken[] {
  const declared = new Map<string, string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet (e.g. a font stylesheet): not ours
    }
    collectRootDeclarations(rules, declared);
  }

  const computed = getComputedStyle(document.documentElement);
  return Array.from(declared, ([name, raw]) => ({
    name,
    raw,
    value: computed.getPropertyValue(name).trim() || raw,
    alias: raw.match(/^var\((--ds-[\w-]+)\)$/)?.[1],
  }));
}

let colorContext: CanvasRenderingContext2D | null = null;

/** Parse any CSS colour string to RGBA (0–255, alpha 0–1), or null if it isn't a colour. */
export function parseColor(value: string): [number, number, number, number] | null {
  colorContext ??= document.createElement('canvas').getContext('2d');
  if (!colorContext) return null;
  colorContext.fillStyle = '#010203';
  colorContext.fillStyle = value;
  const normalised = String(colorContext.fillStyle);
  if (normalised === '#010203' && value.trim().toLowerCase() !== '#010203') return null;
  if (normalised.startsWith('#')) {
    const hex = normalised.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as [number, number, number, number];
  }
  const parts = normalised.match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

function relativeLuminance([r, g, b]: [number, number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colours, or null if either can't be parsed. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const [light, dark] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
