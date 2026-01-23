interface TopHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onImportClick: () => void;
  onDeduplicateClick?: () => void;
}

export function TopHeader({ searchQuery, onSearchChange, onImportClick, onDeduplicateClick }: TopHeaderProps) {
  return (
    <header className="top-header">
      <div className="search-container">
        <span className="material-symbols-outlined">search</span>
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="header-actions">
        <button className="icon-button" title="Notifications">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        {onDeduplicateClick && (
          <button className="secondary-button" onClick={onDeduplicateClick}>
            <span className="material-symbols-outlined">merge</span>
            <span>Resolve Duplicates</span>
          </button>
        )}
        <button className="primary-button" onClick={onImportClick}>
          <span className="material-symbols-outlined">add</span>
          <span>Add Contact</span>
        </button>
      </div>
    </header>
  );
}
