/**
 * Responsive breakpoints — single source of truth for JS.
 *
 * Mirrors the `--ds-bp-*` CSS variables in src/styles/design-system.css.
 * CSS @media conditions can't read var(), so the two must be kept in sync by
 * hand; these are the only breakpoints the app should use.
 */
export const BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;
