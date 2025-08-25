"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function PaginationControls({
  currentPage,
  totalPages,
  setCurrentPage,
  compact = false
}) {
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < Math.max(1, totalPages);

  return (
    <div className={`flex items-center justify-center gap-2 ${compact ? "py-2" : "py-3"}`}>
      <button
        onClick={() => hasPrev && setCurrentPage((p) => Math.max(1, p - 1))}
        disabled={!hasPrev}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${
          hasPrev ? "hover:bg-slate-50" : "opacity-50 cursor-not-allowed"
        }`}
        aria-label="Previous page"
        type="button"
      >
        <ChevronLeft size={16} />
        {!compact && <span>Prev</span>}
      </button>

      <div className="text-xs sm:text-sm text-slate-600 select-none tabular-nums">
        Page <span className="font-medium">{Math.min(currentPage, Math.max(1, totalPages))}</span>{" "}
        of <span className="font-medium">{Math.max(1, totalPages)}</span>
      </div>

      <button
        onClick={() => hasNext && setCurrentPage((p) => Math.min(Math.max(1, totalPages), p + 1))}
        disabled={!hasNext}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${
          hasNext ? "hover:bg-slate-50" : "opacity-50 cursor-not-allowed"
        }`}
        aria-label="Next page"
        type="button"
      >
        {!compact && <span>Next</span>}
        <ChevronRight size={16} />
      </button>
    </div>
  );
}