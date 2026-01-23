interface ViewToggleProps {
  view: 'list' | 'grid';
  onViewChange: (view: 'list' | 'grid') => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="view-toggle">
      <button
        className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`}
        onClick={() => onViewChange('list')}
        title="List view"
      >
        <span className="material-symbols-outlined">view_list</span>
      </button>
      <button
        className={`view-toggle-btn ${view === 'grid' ? 'active' : ''}`}
        onClick={() => onViewChange('grid')}
        title="Grid view"
      >
        <span className="material-symbols-outlined">grid_view</span>
      </button>
    </div>
  );
}
