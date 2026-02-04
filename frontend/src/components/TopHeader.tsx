import { useNavigate } from 'react-router-dom';

interface TopHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function TopHeader({ searchQuery, onSearchChange }: TopHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="top-header">
      <div className="page-header">
        <h1>All Contacts</h1>
      </div>
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

        <button className="primary-button" onClick={() => navigate('/contacts/new')}>
          <span className="material-symbols-outlined">add</span>
          <span>Add Contact</span>
        </button>
      </div>
    </header>
  );
}
