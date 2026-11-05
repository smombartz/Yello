import { Pagination as AntPagination } from 'antd';
import { useIsMobile } from '../../hooks/useIsMobile';
import { paginationIcons } from '../../theme/antIcons';

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
  const isMobile = useIsMobile();

  // Don't show pagination for single page or no results
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="yello-pagination">
    <AntPagination
      align="center"
      current={currentPage}
      total={totalPages}
      pageSize={1}
      showSizeChanger={false}
      disabled={isLoading}
      simple={isMobile}
      onChange={onPageChange}
      {...paginationIcons}
    />
    </div>
  );
}
