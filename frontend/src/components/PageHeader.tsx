import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Breadcrumb as AntBreadcrumb, Flex, Layout, Typography, theme } from 'antd';
import type { BreadcrumbProps } from 'antd';
import logoSvg from '../assets/logo.svg';
import { SearchBar } from './ui/SearchBar';
import { Icon } from './Icon';
import { UserAvatar } from './UserAvatar';
import { useIsMobile } from '../hooks/useIsMobile';
import { shellMetrics } from '../theme/shellMetrics';

export interface Breadcrumb {
  label: string;
  /** Route to navigate to when clicked. */
  to?: string;
  /** Alternative to `to` for in-page navigation (e.g. clearing a drill-down). */
  onClick?: () => void;
}

interface PageHeaderProps {
  title: string;
  breadcrumbs?: Breadcrumb[];
  search?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: () => void;
  searchPlaceholder?: string;
  searchAccessory?: ReactNode;
  info?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

const separator = <Icon name="chevron-right" />;

/**
 * Crumbs, each followed by a chevron; the page title comes after the trail. An `onClick`
 * crumb is a link-styled button: an <a> (so it gets Ant's breadcrumb link look) with
 * role="button", in the tab order, Enter and Space activate it.
 */
function toBreadcrumbItems(crumbs: Breadcrumb[]): BreadcrumbProps['items'] {
  return crumbs.flatMap((crumb) => {
    const activate = () => crumb.onClick?.();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    };
    const title = crumb.to ? (
      <Link to={crumb.to}>{crumb.label}</Link>
    ) : (
      <a role="button" tabIndex={0} onClick={activate} onKeyDown={onKeyDown}>{crumb.label}</a>
    );
    return [
      { key: crumb.label, title },
      { key: `${crumb.label}-sep`, type: 'separator' as const, separator },
    ];
  });
}

export function PageHeader({
  title,
  breadcrumbs,
  search,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search...',
  searchAccessory,
  info,
  actions,
  children,
}: PageHeaderProps) {
  const { token } = theme.useToken();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const metrics = shellMetrics(token);
  const showSearch = onSearchChange !== undefined;

  const headerStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    insetInline: 0,
    zIndex: 'var(--ds-z-fixed)',
    // Layout sets the height (one value for the header, the body offset and page sticky offsets)
    height: 'var(--ds-header-height)',
    background: token.colorBgContainer,
    color: token.colorText,
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
  };

  // Title, with the breadcrumb trail before it. The page's only heading, so level 1 to
  // assistive tech whatever size it's drawn at.
  const heading = (
    <Typography.Title level={4} ellipsis aria-level={1} style={{ margin: 0, minWidth: 0 }}>
      {title}
    </Typography.Title>
  );
  const titleBlock = (
    <Flex
      align="center"
      gap={token.marginXS}
      style={{
        minWidth: isMobile ? 0 : 'var(--ds-header-title-min)',
        flex: isMobile ? '1 1 auto' : '0 1 auto',
        overflow: 'hidden',
      }}
    >
      {breadcrumbs?.length ? (
        <AntBreadcrumb
          aria-label="Breadcrumb"
          separator=""
          items={toBreadcrumbItems(breadcrumbs)}
          style={{ flexShrink: 0 }}
        />
      ) : null}
      {heading}
    </Flex>
  );

  const searchBar = showSearch ? (
    <SearchBar
      value={search ?? ''}
      onChange={onSearchChange}
      onSubmit={onSearchSubmit}
      placeholder={searchPlaceholder}
      size={isMobile ? 'large' : 'middle'}
    />
  ) : null;

  const actionsBlock = actions ? (
    <Flex
      align="center"
      gap={token.paddingXS}
      // Pinned to the right edge of the content column; after a search or info block,
      // those already carry the auto margin
      style={{ minWidth: 0, flexShrink: 0, marginInlineStart: showSearch || (info && !isMobile) ? 0 : 'auto' }}
    >
      {actions}
    </Flex>
  ) : null;

  const logoLink = (
    <Link
      to="/dashboard"
      aria-label="Go to dashboard"
      style={{ display: 'flex', alignItems: 'center' }}
    >
      {isMobile ? (
        // Phones have no room for the wordmark: the mark alone stands in for it
        <img
          src="/favicon.svg"
          alt="Yello"
          style={{ width: 'var(--ds-header-mark-size)', height: 'var(--ds-header-mark-size)' }}
        />
      ) : (
        <img src={logoSvg} alt="Yello" style={{ height: 'var(--ds-header-logo-size)', width: 'auto' }} />
      )}
    </Link>
  );

  if (isMobile) {
    // Phones: mark · title · actions · avatar, then (with search) the search across the
    // width with its accessory (sort & filter) at the end. Side padding matches the
    // content column, so search and avatar end on its edge.
    const onProfile = pathname === '/profile';
    const sidePadding = (side: 'left' | 'right') => `max(${token.padding}px, env(safe-area-inset-${side}))`;
    return (
      <Layout.Header
        style={{
          ...headerStyle,
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: sidePadding('right'),
          paddingBottom: showSearch ? metrics.phoneSearchPaddingBottom : 0,
          paddingLeft: sidePadding('left'),
        }}
      >
        <Flex align="center" gap={token.paddingSM} style={{ height: metrics.phoneBarHeight }}>
          {logoLink}
          {titleBlock}
          {actionsBlock}
          {/* The way to Profile, which the bottom tab bar has no room for. The link is a
              40px target around the 32px avatar; the negative margin keeps the row's spacing. */}
          <Link
            to="/profile"
            aria-label="Profile"
            aria-current={onProfile ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: token.controlHeightLG,
              height: token.controlHeightLG,
              margin: -(token.controlHeightLG - token.controlHeight) / 2,
              borderRadius: '50%',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <UserAvatar
              size={token.controlHeight}
              style={onProfile ? {
                boxShadow: `0 0 0 ${token.lineWidthBold}px ${token.colorBgContainer}, 0 0 0 ${token.lineWidthBold * 2}px ${token.colorPrimary}`,
              } : undefined}
            />
          </Link>
        </Flex>

        {showSearch && (
          <Flex align="center" gap={token.paddingSM} style={{ height: metrics.phoneSearchRowHeight }}>
            <div style={{ flex: 1, minWidth: 0 }}>{searchBar}</div>
            {searchAccessory && <Flex style={{ flexShrink: 0 }}>{searchAccessory}</Flex>}
          </Flex>
        )}

        {children && <div>{children}</div>}
      </Layout.Header>
    );
  }

  // Desktop: logo column · content column · spacer column. The side columns share the
  // free space and the same floor, so the content column stays centred on the viewport,
  // over the main content column.
  const sideColumn: CSSProperties = { flex: 1, minWidth: 'var(--ds-header-side-col-min)' };
  return (
    <Layout.Header
      style={{
        ...headerStyle,
        display: 'flex',
        alignItems: 'center',
        columnGap: token.padding,
        paddingBlock: 0,
        paddingInline: token.padding,
      }}
    >
      <div style={{ ...sideColumn, display: 'flex', alignItems: 'center', height: '100%' }}>{logoLink}</div>

      {/* Targets the content width but shrinks below it on narrow windows */}
      <div style={{ flex: '0 1 var(--ds-content-width)', minWidth: 0 }}>
        <Flex align="center" gap={token.paddingLG} style={{ width: '100%', minWidth: 0 }}>
          {titleBlock}

          {/* Pinned right, ahead of any info and actions */}
          {searchBar && (
            <div
              style={{
                flex: 1,
                minWidth: 'var(--ds-header-search-min)',
                maxWidth: 'var(--ds-header-search-width)',
                marginInlineStart: 'auto',
              }}
            >
              {searchBar}
            </div>
          )}

          {showSearch && searchAccessory && <Flex style={{ flexShrink: 0 }}>{searchAccessory}</Flex>}

          {/* Counts sit in the same spot on every page: pinned right, or right after the search */}
          {info && (
            <Typography.Text
              type="secondary"
              ellipsis
              style={{ minWidth: 0, flexShrink: 1, textAlign: 'right', marginInlineStart: showSearch ? 0 : 'auto' }}
            >
              {info}
            </Typography.Text>
          )}

          {actionsBlock}
        </Flex>

        {children && <div style={{ paddingBlock: token.paddingXS }}>{children}</div>}
      </div>

      <div style={sideColumn} />
    </Layout.Header>
  );
}
