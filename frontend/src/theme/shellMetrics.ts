import type { GlobalToken } from 'antd';

/**
 * The app shell's fixed geometry, from Ant's tokens. Layout publishes it as the
 * --ds-header-height, --ds-nav-rail-width and --ds-tab-bar-height CSS variables,
 * which page CSS uses for sticky offsets and viewport-height calculations.
 */
export function shellMetrics(token: GlobalToken) {
  return {
    /** Desktop header: Ant's Layout.Header height (controlHeight × 2) */
    headerHeight: token.controlHeight * 2,
    /** Desktop rail: Ant's collapsed Sider and Menu width (controlHeightLG × 2) */
    railWidth: token.controlHeightLG * 2,
    /** A phone bar row (header, bottom tab bar): a 40px target with 8px above and below */
    phoneBarHeight: token.controlHeightLG + token.paddingXS * 2,
    /** The phone header's second row, the search field */
    phoneSearchRowHeight: token.controlHeightLG,
    /** Space under the phone header's search row */
    phoneSearchPaddingBottom: token.paddingSM,
  };
}

/** The CSS variables Layout sets on <html> for the current shell */
export function shellCssVars(token: GlobalToken, isMobile: boolean, hasSearch: boolean): Record<string, string> {
  const m = shellMetrics(token);
  if (!isMobile) {
    return {
      '--ds-header-height': `${m.headerHeight}px`,
      '--ds-nav-rail-width': `${m.railWidth}px`,
      '--ds-tab-bar-height': '0px',
    };
  }
  const header = m.phoneBarHeight + (hasSearch ? m.phoneSearchRowHeight + m.phoneSearchPaddingBottom : 0);
  return {
    // Both phone bars include their safe area, so one value is the whole space they cover
    '--ds-header-height': `calc(${header}px + env(safe-area-inset-top))`,
    '--ds-nav-rail-width': '0px',
    '--ds-tab-bar-height': `calc(${m.phoneBarHeight}px + env(safe-area-inset-bottom))`,
  };
}
