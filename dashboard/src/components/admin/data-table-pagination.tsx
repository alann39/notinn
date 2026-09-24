import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";

export interface DataTablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemName?: string;
  loading?: boolean;
}

export function DataTablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemName = "item",
  loading = false,
}: DataTablePaginationProps) {
  if (totalItems === 0) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border">
      <div className="text-xs text-muted-foreground text-center sm:text-left">
        Menampilkan {start}–{end} dari {totalItems} {itemName}
      </div>

      <Pagination className="mx-0 w-auto">
        <PaginationContent className="flex items-center gap-2">
          <PaginationItem>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || loading}
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              className="gap-1.5 px-3 text-xs font-medium cursor-pointer h-8 disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
          </PaginationItem>

          <PaginationItem>
            <span className="px-3.5 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-mono text-foreground font-medium select-none">
              Page {currentPage} of {Math.max(1, totalPages)}
            </span>
          </PaginationItem>

          <PaginationItem>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || loading}
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              className="gap-1.5 px-3 text-xs font-medium cursor-pointer h-8 disabled:opacity-40"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="size-3.5" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
