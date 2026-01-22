const PAGE_SIZES = [10, 25, 50, 100];

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const safeTotal = Number.isFinite(total) ? total : 0;
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const start = safeTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(safeTotal, page * pageSize);

  return (
    <div className="pagination">
      <div className="pagination-summary">
          <span>
            Showing {start}-{end} of {safeTotal}
          </span>
        </div>
      <div className="pagination-controls">
        <label>
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="pagination-buttons">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={!canPrev}>
            Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={!canNext}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
