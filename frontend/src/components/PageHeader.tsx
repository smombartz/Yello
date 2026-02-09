import { type ReactNode } from 'react';
import logoSvg from '../assets/logo.svg';
import { Icon } from './Icon';

interface PageHeaderProps {
  title: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  info?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({
  title,
  search,
  onSearchChange,
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
          <img src={logoSvg} alt="Yello" className="page-header-logo" />
        </div>

        <div className="page-header-col-center">
          <div className="page-header-center-row">
            <h1 className="page-header-title">{title}</h1>

            {showSearch && (
              <div className="page-header-search">
                <Icon name="magnifying-glass" className="page-header-search-icon" />
                <input
                  type="text"
                  value={search ?? ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="page-header-search-input"
                />
                {search && (
                  <button
                    type="button"
                    className="page-header-search-clear"
                    onClick={() => onSearchChange('')}
                    aria-label="Clear search"
                  >
                    <Icon name="xmark" />
                  </button>
                )}
              </div>
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
