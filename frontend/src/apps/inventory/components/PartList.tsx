import { useMemo, useRef, useState } from 'react';
import type { FC } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ExpandedState,
  type Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Plus,
  Pencil,
  MoreHorizontal,
  SlidersHorizontal,
  Package,
  Calendar,
  MapPin,
  ArrowUpDown,
} from 'lucide-react';
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
import type { InventoryBatch, InventoryPart } from '../types';

interface PartListProps {
  parts: InventoryPart[];
  isLoading: boolean;
  isOffline: boolean;
  isSearching?: boolean;
  onAdjustBatch: (part: InventoryPart, batch: InventoryBatch) => void;
  onAddBatch: (part: InventoryPart) => void;
  onEditBatch: (part: InventoryPart, batch: InventoryBatch) => void;
  onEditPart: (part: InventoryPart) => void;
}

type VirtualEntry =
  | { kind: 'part'; row: Row<InventoryPart>; key: string }
  | { kind: 'details'; part: InventoryPart; key: string };

const columnHelper = createColumnHelper<InventoryPart>();

export const PartList: FC<PartListProps> = ({
  parts,
  isLoading,
  isOffline,
  isSearching = false,
  onAdjustBatch,
  onAddBatch,
  onEditBatch,
  onEditPart,
}) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.common_name || row.name, {
        id: 'name',
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Name</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ row }) => {
          const part = row.original;
          return (
            <div className="min-w-[160px] max-w-[280px] whitespace-normal py-0.5">
              <div className="font-medium text-foreground text-xs sm:text-sm leading-tight truncate">
                {part.common_name || part.name}
              </div>
              {part.common_name && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {part.name}
                </div>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('part_number', {
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Part #</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs font-semibold text-foreground">
            {getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('revision', {
        header: 'Rev',
        cell: ({ row }) => {
          const part = row.original;
          const isObsolete = part.lifecycle_status === 'obsolete';
          return (
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="font-mono text-[11px]">
                {part.revision}
                {part.iteration ? `.${part.iteration}` : ''}
              </Badge>
              {isObsolete && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono bg-amber-500/15 text-amber-400 border-amber-500/40"
                >
                  Obsolete
                </Badge>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => row.category || '', {
        id: 'category',
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
        cell: ({ getValue }) => {
          const val = getValue();
          return val ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {val}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground/50">—</span>
          );
        },
      }),
      columnHelper.accessor('total_active_quantity', {
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer ml-auto"
          >
            <span>Stock</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ row }) => {
          const part = row.original;
          return (
            <div className="text-right">
              <div
                className={cn(
                  'font-mono text-sm font-bold',
                  part.total_active_quantity < 0 ? 'text-amber-400' : 'text-foreground'
                )}
              >
                {part.total_active_quantity}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {part.batches.length}{' '}
                {part.batches.length === 1 ? 'batch' : 'batches'}
              </div>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'add_batch',
        header: () => <span className="sr-only">Add Batch</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={isOffline}
              onClick={(e) => {
                e.stopPropagation();
                onAddBatch(row.original);
              }}
              className="gap-1 text-xs h-7 px-2 cursor-pointer"
              title="Add a new received batch"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden md:inline">Batch</span>
            </Button>
          </div>
        ),
      }),
      columnHelper.display({
        id: 'edit_part',
        header: () => <span className="sr-only">Edit</span>,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={isOffline}
              onClick={(e) => {
                e.stopPropagation();
                onEditPart(row.original);
              }}
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Edit part metadata"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        ),
      }),
      columnHelper.display({
        id: 'more_info',
        header: () => <span className="sr-only">Batches & Details</span>,
        cell: ({ row }) => {
          const isExp = row.getIsExpanded();
          return (
            <div className="flex justify-center">
              <Button
                type="button"
                variant={isExp ? 'secondary' : 'ghost'}
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  row.toggleExpanded();
                }}
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                title={isExp ? 'Hide batches & details' : 'Show batches & details'}
                aria-expanded={isExp}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          );
        },
      }),
    ],
    [isOffline, onAddBatch, onEditPart]
  );

  // When searching, keep backend fuzzy-relevance order unless user clicks a column sort header
  const effectiveSorting = useMemo(
    () => (isSearching && sorting.length === 0 ? [] : sorting),
    [isSearching, sorting]
  );

  const table = useReactTable({
    data: parts,
    columns,
    state: {
      sorting: effectiveSorting,
      expanded,
    },
    getRowId: (row) => String(row.id),
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  // Flatten visible rows + expanded batch detail rows so each virtual item is 1 <tr>
  const tableRows = table.getRowModel().rows;
  const virtualEntries = useMemo<VirtualEntry[]>(() => {
    const entries: VirtualEntry[] = [];
    for (const row of tableRows) {
      entries.push({ kind: 'part', row, key: `part-${row.id}` });
      if (row.getIsExpanded()) {
        entries.push({
          kind: 'details',
          part: row.original,
          key: `details-${row.id}`,
        });
      }
    }
    return entries;
  }, [tableRows]);

  const rowVirtualizer = useVirtualizer({
    count: virtualEntries.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const entry = virtualEntries[index];
      if (entry?.kind === 'details') {
        const batchCount = Math.max(1, entry.part.batches.length);
        return 44 + batchCount * 46;
      }
      return 52;
    },
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0;

  if (isLoading && parts.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Loading inventory...
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <Card className="p-10 text-center space-y-2">
        <Package className="w-8 h-8 text-muted-foreground/60 mx-auto" />
        <div className="text-sm font-medium text-foreground">No parts found</div>
        <p className="text-xs text-muted-foreground">
          Add a new part version or adjust your search filters.
        </p>
      </Card>
    );
  }

  const colCount = table.getAllColumns().length;

  return (
    <div className="flex-1 min-h-0 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto relative">
        <table data-slot="table" className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-xs border-b border-border">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'px-3 h-9 text-xs',
                      header.id === 'total_active_quantity' && 'text-right',
                      (header.id === 'add_batch' ||
                        header.id === 'edit_part' ||
                        header.id === 'more_info') &&
                        'w-10 px-1.5'
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {paddingTop > 0 && (
              <tr>
                <td colSpan={colCount} style={{ height: `${paddingTop}px`, padding: 0 }} />
              </tr>
            )}

            {virtualItems.map((vRow) => {
              const entry = virtualEntries[vRow.index];
              if (!entry) return null;

              if (entry.kind === 'part') {
                const { row } = entry;
                const isObsolete = row.original.lifecycle_status === 'obsolete';
                const isExp = row.getIsExpanded();
                return (
                  <TableRow
                    key={entry.key}
                    data-index={vRow.index}
                    ref={rowVirtualizer.measureElement}
                    onClick={() => row.toggleExpanded()}
                    className={cn(
                      'cursor-pointer',
                      isObsolete && 'opacity-70 bg-amber-950/10',
                      isExp && 'bg-muted/40 border-b-0'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'px-3 py-2',
                          (cell.column.id === 'add_batch' ||
                            cell.column.id === 'edit_part' ||
                            cell.column.id === 'more_info') &&
                            'px-1.5'
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              }

              // Expanded details / received batches row
              const { part } = entry;
              return (
                <TableRow
                  key={entry.key}
                  data-index={vRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="bg-muted/20 hover:bg-muted/20"
                >
                  <TableCell colSpan={colCount} className="p-3 whitespace-normal">
                    <div className="space-y-2">
                      {part.description && (
                        <p className="text-xs text-muted-foreground">
                          {part.description}
                        </p>
                      )}

                      {part.batches.length === 0 ? (
                        <div className="flex items-center justify-between text-xs text-muted-foreground italic py-1">
                          <span>No batches received yet.</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={isOffline}
                            onClick={() => onAddBatch(part)}
                            className="gap-1 text-xs h-7 cursor-pointer not-italic"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add First Batch</span>
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {part.batches.map((batch) => {
                            const isDepleted = batch.batch_status === 'depleted';
                            return (
                              <div
                                key={batch.id}
                                className={cn(
                                  'flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs',
                                  isDepleted
                                    ? 'bg-background/40 border-border/60 opacity-70'
                                    : 'bg-background/80 border-border/80'
                                )}
                              >
                                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                  <span className="font-mono font-semibold text-foreground">
                                    Batch {batch.batch_number}
                                  </span>

                                  {batch.received_date && (
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                                      <Calendar className="w-3 h-3" />
                                      {batch.received_date}
                                    </span>
                                  )}

                                  {batch.location && (
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <MapPin className="w-3 h-3" />
                                      {batch.location}
                                    </span>
                                  )}

                                  {isDepleted && (
                                    <Badge variant="outline" className="text-[10px] font-mono">
                                      Depleted
                                    </Badge>
                                  )}

                                  {batch.notes && (
                                    <span className="text-[11px] text-muted-foreground truncate max-w-[260px]">
                                      — {batch.notes}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className={cn(
                                      'font-mono font-bold text-sm min-w-[2.5rem] text-right',
                                      batch.quantity < 0
                                        ? 'text-amber-400'
                                        : 'text-foreground'
                                    )}
                                  >
                                    {batch.quantity}
                                  </span>

                                  <Button
                                    type="button"
                                    variant="default"
                                    size="xs"
                                    disabled={isOffline}
                                    onClick={() => onAdjustBatch(part, batch)}
                                    className="gap-1 text-xs h-7 px-2.5 cursor-pointer"
                                  >
                                    <SlidersHorizontal className="w-3 h-3" />
                                    <span>Adjust</span>
                                  </Button>

                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={isOffline}
                                    onClick={() => onEditBatch(part, batch)}
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                    title="Edit batch details"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {paddingBottom > 0 && (
              <tr>
                <td colSpan={colCount} style={{ height: `${paddingBottom}px`, padding: 0 }} />
              </tr>
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
};
