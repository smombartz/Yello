import { useLayoutEffect } from 'react';
import { theme } from 'antd';

/**
 * Points the old --ds-* CSS variables at Ant's live theme, so screens not yet
 * migrated pick up Ant's colours and font now (and dark mode later) without CSS
 * edits. Inline styles on <html> override the :root values in design-system.css.
 * Delete entries as their last users migrate (Phase 9).
 */
export function TokenBridge() {
  const { token: t } = theme.useToken();

  useLayoutEffect(() => {
    const px = (n: number) => `${n}px`;
    const vars: Record<string, string> = {
      '--ds-color-primary': t.colorPrimary,
      '--ds-color-primary-hover': t.colorPrimaryHover,
      '--ds-color-primary-light': t.colorPrimaryBg,
      '--ds-color-primary-dark': t.colorPrimaryActive,
      '--ds-color-error': t.colorError,
      '--ds-color-error-hover': t.colorErrorHover,
      '--ds-color-error-light': t.colorErrorBg,
      '--ds-color-error-dark': t.colorErrorActive,
      '--ds-color-success': t.colorSuccess,
      '--ds-color-success-hover': t.colorSuccessHover,
      '--ds-color-success-light': t.colorSuccessBg,
      '--ds-color-success-dark': t.colorSuccessActive,
      '--ds-color-warning': t.colorWarning,
      '--ds-color-warning-hover': t.colorWarningHover,
      '--ds-color-warning-light': t.colorWarningBg,
      '--ds-color-warning-dark': t.colorWarningActive,
      '--ds-color-info': t.colorInfo,
      '--ds-color-info-hover': t.colorInfoHover,
      '--ds-color-info-light': t.colorInfoBg,
      '--ds-color-info-dark': t.colorInfoActive,
      '--ds-text-primary': t.colorText,
      '--ds-text-secondary': t.colorTextSecondary,
      '--ds-text-tertiary': t.colorTextTertiary,
      '--ds-text-muted': t.colorTextTertiary,
      '--ds-text-disabled': t.colorTextDisabled,
      '--ds-text-inverse': t.colorTextLightSolid,
      '--ds-text-link': t.colorLink,
      '--ds-text-link-hover': t.colorLinkHover,
      '--ds-bg-primary': t.colorBgContainer,
      '--ds-bg-secondary': t.colorBgLayout,
      '--ds-bg-tertiary': t.colorFillTertiary,
      '--ds-bg-hover': t.controlItemBgHover,
      '--ds-bg-active': t.controlItemBgActive,
      '--ds-bg-selected': t.controlItemBgActive,
      '--ds-bg-overlay': t.colorBgMask,
      '--ds-border-color': t.colorBorderSecondary,
      '--ds-border-light': t.colorSplit,
      '--ds-border-dark': t.colorBorder,
      '--ds-border-focus': t.colorPrimary,
      '--ds-font-family': t.fontFamily,
      '--ds-font-mono': t.fontFamilyCode,
      '--ds-radius-sm': px(t.borderRadiusSM),
      '--ds-radius-md': px(t.borderRadius),
      '--ds-radius-lg': px(t.borderRadiusLG),
      '--ds-shadow-xs': t.boxShadowTertiary,
      '--ds-shadow-sm': t.boxShadowTertiary,
      '--ds-shadow-md': t.boxShadowSecondary,
      '--ds-shadow-lg': t.boxShadow,
      '--ds-shadow-focus': `0 0 0 ${px(t.controlOutlineWidth)} ${t.controlOutline}`,
      '--ds-duration-fast': t.motionDurationFast,
      '--ds-duration-normal': t.motionDurationMid,
      '--ds-duration-slow': t.motionDurationSlow,
      '--ds-easing-default': t.motionEaseInOut,
      '--ds-easing-in': t.motionEaseInQuint,
      '--ds-easing-out': t.motionEaseOut,
      '--ds-control-height': px(t.controlHeight),
    };
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
  }, [t]);

  return null;
}
