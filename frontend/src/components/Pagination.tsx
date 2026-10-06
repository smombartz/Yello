import { Icon } from './Icon';
import { Button } from './ui/Button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false,
}: PaginationProps) {
  // Don't show pagination for single page or no results
  if (totalPages <= 1) {
    return null;
  }

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div className="pagination">
      <Button
        variant="secondary"
        icon="chevron-left"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!canGoPrevious || isLoading}
        aria-label="Previous page"
      >
        <span>Prev</span>
      </Button>

      <span className="pagination-indicator">
        Page {currentPage} of {totalPages}
      </span>

      <Button
        variant="secondary"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!canGoNext || isLoading}
        aria-label="Next page"
      >
        <span>Next</span>
        <Icon name="chevron-right" />
      </Button>
    </div>
  );
}
