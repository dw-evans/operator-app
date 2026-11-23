import { useMemo, useRef, useState } from 'react';
import type { FC } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnSizingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpDown, MoreHorizontal, AlertTriangle } from 'lucide-react';
import {
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { QualityIssue, QualityIssueStatus } from '../types';

interface QualityIssueTableProps {
  issues: QualityIssue[];
  isLoading: boolean;
  onViewPhotos: (urls: string[], index: number) => void;
  onOpenDetail: (issue: QualityIssue) => void;
}

const STATUS_BADGE_STYLES: Record<QualityIssueStatus, string> = {
  open: 'border-amber-500/40 bg-amber-500/15 text-amber-400',
  resolved: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
  obsolete: 'border-border bg-muted/60 text-muted-foreground',
};

const columnHelper = createColumnHelper<QualityIssue>();

const COLUMN_SIZING_KEY = 'quality_table_column_sizing_v1';

const loadSavedColumnSizing = (): ColumnSizingState => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(COLUMN_SIZING_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const formatDateShort = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const QualityIssueTable: FC<QualityIssueTableProps> = ({
  issues,
  isLoading,
  onViewPhotos,
  onOpenDetail,
}) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [columnSizing, setColumnSizing] =
    useState<ColumnSizingState>(loadSavedColumnSizing);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleColumnSizingChange = (
    updater:
      | ColumnSizingState
      | ((old: ColumnSizingState) => ColumnSizingState)
  ) => {
    setColumnSizing((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem(COLUMN_SIZING_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('created_at', {
        id: 'created_at',
        size: 120,
        minSize: 95,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Date</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="text-xs font-mono text-muted-foreground block truncate">
            {formatDateShort(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.common_name || row.part_name, {
        id: 'name',
        size: 180,
        minSize: 100,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Name</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ row }) => {
          const primary = row.original.common_name || row.original.part_name;
          return (
            <span
              className="text-sm font-normal text-foreground block truncate"
              title={primary}
            >
              {primary}
            </span>
          );
        },
      }),
      columnHelper.accessor('part_number', {
        size: 120,
        minSize: 80,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Part #</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-foreground block truncate">
            {getValue()}
          </span>
        ),
      }),
      columnHelper.accessor(
        (row) => (row.iteration ? `${row.revision}.${row.iteration}` : row.revision),
        {
          id: 'revision',
          size: 72,
          minSize: 55,
          header: ({ column }) => (
            <button
              type="button"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <span>Rev</span>
              <ArrowUpDown className="w-3 h-3" />
            </button>
          ),
          cell: ({ getValue }) => (
            <span className="font-mono text-xs text-muted-foreground block truncate">
              {getValue() || '—'}
            </span>
          ),
        }
      ),
      columnHelper.accessor('batch_number', {
        size: 82,
        minSize: 60,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Batch</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => {
          const val = getValue();
          return val ? (
            <Badge variant="outline" className="text-[11px] font-mono px-1.5 py-0">
              {val}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground/50">—</span>
          );
        },
      }),
      columnHelper.accessor((row) => row.batch_code || '', {
        id: 'batch_code',
        size: 115,
        minSize: 75,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Batch Code</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => {
          const val = getValue();
          return val ? (
            <span className="font-mono text-xs text-foreground block truncate" title={val}>
              {val}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/50">—</span>
          );
        },
      }),
      columnHelper.accessor((row) => row.subassembly || '', {
        id: 'subassembly',
        size: 120,
        minSize: 75,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Subassembly</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground block truncate">
            {getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.category || '', {
        id: 'category',
        size: 110,
        minSize: 70,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Category</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground block truncate">
            {getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('status', {
        size: 96,
        minSize: 80,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Status</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ row }) => {
          const currentStatus: QualityIssueStatus = row.original.status || 'open';
          return (
            <Badge
              variant="outline"
              className={cn(
                'text-[11px] font-medium capitalize px-2 py-0.5',
                STATUS_BADGE_STYLES[currentStatus]
              )}
            >
              {currentStatus}
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: 'photos',
        size: 145,
        minSize: 90,
        header: () => (
          <span className="text-xs font-medium text-muted-foreground">
            Photos
          </span>
        ),
        cell: ({ row }) => {
          const issue = row.original;
          const photos = issue.photo_urls || [];
          const visiblePhotos = photos.slice(0, 3);
          const extraCount = photos.length - visiblePhotos.length;

          if (photos.length === 0) {
            return <span className="text-xs text-muted-foreground/50">—</span>;
          }

          return (
            <div className="flex items-center gap-1">
              {visiblePhotos.map((url, idx) => (
                <button
                  key={url}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewPhotos(photos, idx);
                  }}
                  className="w-8 h-8 rounded border border-border overflow-hidden bg-muted hover:ring-2 hover:ring-primary/60 transition-all cursor-pointer shrink-0"
                  title={`View photo ${idx + 1} of ${photos.length}`}
                >
                  <img
                    src={url}
                    alt={`Issue #${issue.id} photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
              {extraCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewPhotos(photos, 3);
                  }}
                  className="h-8 px-1.5 rounded border border-border bg-muted/70 hover:bg-muted text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                  title={`View all ${photos.length} photos`}
                >
                  +{extraCount}…
                </button>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('description', {
        size: 260,
        minSize: 140,
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Issue Description</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => {
          const val = getValue();
          return (
            <div className="text-xs text-foreground/90 truncate" title={val}>
              {val}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        size: 54,
        minSize: 48,
        enableResizing: false,
        header: () => <span className="sr-only">Open</span>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(row.original);
              }}
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              title="View quality report details"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        ),
      }),
    ],
    [onViewPhotos, onOpenDetail]
  );

  const table = useReactTable({
    data: issues,
    columns,
    state: {
      sorting,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnSizingChange: handleColumnSizingChange,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  if (isLoading && issues.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Loading quality reports...
      </Card>
    );
  }

  if (issues.length === 0) {
    return (
      <Card className="p-12 text-center space-y-2">
        <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <div className="text-sm font-medium text-foreground">
          No quality issues found
        </div>
        <p className="text-xs text-muted-foreground">
          Use &ldquo;Report Issue&rdquo; to log a new quality report for a part.
        </p>
      </Card>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalHeight - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <Card className="flex-1 min-h-0 flex flex-col overflow-hidden border-border">
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto relative"
      >
        <table
          className="border-collapse text-sm"
          style={{
            width: table.getTotalSize(),
            minWidth: '100%',
            tableLayout: 'fixed',
          }}
        >
          <TableHeader className="sticky top-0 z-10 bg-card border-b border-border shadow-xs">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="relative h-9 px-3 select-none overflow-hidden"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        className={cn(
                          'absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none transition-colors',
                          header.column.getIsResizing()
                            ? 'bg-primary'
                            : 'hover:bg-border'
                        )}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {paddingTop > 0 && (
              <tr>
                <td colSpan={columns.length} style={{ height: paddingTop }} />
              </tr>
            )}

            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <TableRow
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  onClick={() => onOpenDetail(row.original)}
                  className="hover:bg-muted/30 border-b border-border/60 cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="px-3 py-2 overflow-hidden"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}

            {paddingBottom > 0 && (
              <tr>
                <td colSpan={columns.length} style={{ height: paddingBottom }} />
              </tr>
            )}
          </TableBody>
        </table>
      </div>
    </Card>
  );
};
