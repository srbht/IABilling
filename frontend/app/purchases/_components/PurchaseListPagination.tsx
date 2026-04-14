'use client';

import { cn } from '@/lib/utils';

export const PURCHASE_PAGE_SIZE = 15;

export type PurchaseListMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function PurchaseListPagination({
  meta,
  page,
  onPageChange,
  compact,
}: {
  meta?: PurchaseListMeta | null;
  page: number;
  onPageChange: (p: number) => void;
  compact?: boolean;
}) {
  if (!meta || meta.total === 0) return null;
  const totalPages = Math.max(1, meta.totalPages);
  const from = (page - 1) * meta.limit + 1;
  const to = Math.min(page * meta.limit, meta.total);
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2',
        compact ? 'pt-2' : 'pt-3',
      )}
    >
      <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
        Showing {from}–{to} of {meta.total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-outline text-xs py-1.5 px-3"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn-outline text-xs py-1.5 px-3"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
