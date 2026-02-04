import { useNavigate } from 'react-router-dom';

interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  onSearch?: () => void;
  onEdit?: () => void;
  onRecenter?: () => void;
}

export function MobileHeader({
  title,
  showBack = false,
  onSearch,
  onEdit,
  onRecenter
}: MobileHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <header className="mobile-header">
      <div className="mobile-header-left">
        {showBack && (
          <button className="mobile-header-btn" onClick={handleBack} aria-label="Go back">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        )}
      </div>

      <h1 className="mobile-header-title">{title}</h1>

      <div className="mobile-header-right">
        {onSearch && (
          <button className="mobile-header-btn" onClick={onSearch} aria-label="Search">
            <span className="material-symbols-outlined">search</span>
          </button>
        )}
        {onEdit && (
          <button className="mobile-header-btn" onClick={onEdit} aria-label="Edit">
            <span className="material-symbols-outlined">edit</span>
          </button>
        )}
        {onRecenter && (
          <button className="mobile-header-btn" onClick={onRecenter} aria-label="Recenter map">
            <span className="material-symbols-outlined">my_location</span>
          </button>
        )}
      </div>
    </header>
  );
}
