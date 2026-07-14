import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logoSvg from '../assets/logo.svg';
import { SearchBar } from './ui/SearchBar';

interface PageHeaderProps {
  title: string;
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
            <h1 className="page-header-title">{title}</h1>

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
          </div>

          {children && (
            <div className="page-header-sub">{children}</div>
          )}
        </div>

        <div className="page-header-col-right">
          {actions && <div className="page-header-actions">{actions}</div>}
        </div>
      </div>
    </header>
  );
}
