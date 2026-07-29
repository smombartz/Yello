import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logoSvg from '../assets/logo.svg';
import { SearchBar } from './ui/SearchBar';
import { Icon } from './Icon';

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
  info?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({
  title,
  breadcrumbs,
  search,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search...',
  info,
  actions,
  children,
}: PageHeaderProps) {
  const showSearch = onSearchChange !== undefined;

  return (
    <header className="page-header">
      <div className="page-header-row">
        <div className="page-header-col-left">
          <Link to="/dashboard" className="page-header-logo-link" aria-label="Go to dashboard">
            <img src={logoSvg} alt="Yello" className="page-header-logo" />
          </Link>
        </div>

        <div className="page-header-col-center">
          <div className="page-header-center-row">
            {breadcrumbs?.length ? (
              <nav className="page-header-breadcrumbs" aria-label="Breadcrumb">
                {breadcrumbs.map((crumb) => (
                  <span key={crumb.label} className="page-header-crumb-item">
                    {crumb.to ? (
                      <Link to={crumb.to} className="page-header-crumb">
                        {crumb.label}
                      </Link>
                    ) : (
                      <button type="button" className="page-header-crumb" onClick={crumb.onClick}>
                        {crumb.label}
                      </button>
                    )}
                    <Icon name="chevron-right" className="page-header-crumb-sep" />
                  </span>
                ))}
                <h1 className="page-header-title">{title}</h1>
              </nav>
            ) : (
              <h1 className="page-header-title">{title}</h1>
            )}

            {showSearch && (
              <SearchBar
                value={search ?? ''}
                onChange={onSearchChange}
                onSubmit={onSearchSubmit}
                placeholder={searchPlaceholder}
                className="search-bar--header"
              />
            )}

            {info && <div className="page-header-info">{info}</div>}

            {actions && <div className="page-header-actions">{actions}</div>}
          </div>

          {children && (
            <div className="page-header-sub">{children}</div>
          )}
        </div>

        <div className="page-header-col-right" />
      </div>
    </header>
  );
}
