"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  loading?: boolean;
  onPage: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  loading = false,
  onPage
}: PaginationProps) {
  return (
    <div className="pager">
      <span className="pager-info">
        第 {page} / {totalPages} 页
      </span>
      <div className="pager-actions">
        <button
          type="button"
          className="button small"
          disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}
        >
          上一页
        </button>
        <button
          type="button"
          className="button small"
          disabled={page >= totalPages || loading}
          onClick={() => onPage(page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
