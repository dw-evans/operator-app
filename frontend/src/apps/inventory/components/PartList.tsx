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
  onAdjustPart: (part: InventoryPart) => void;
  onAddBatch: (part: InventoryPart) => void;
  onEditBatch: (part: InventoryPart, batch: InventoryBatch) => void;
  onEditPart: (part: InventoryPart) => void;
  onViewPhoto: (url: string) => void;
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
  onAdjustPart,
  onAddBatch,
  onEditBatch,
  onEditPart,
  onViewPhoto,
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
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Name</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="text-sm font-normal text-foreground block max-w-[260px] truncate">
            {getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('part_number', {
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
          <span className="text-sm font-normal text-foreground">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('revision', {
        header: 'Rev',
        cell: ({ row }) => {
          const part = row.original;
          const isObsolete = part.lifecycle_status === 'obsolete';
          return (
            <div className="flex items-center gap-2 text-sm font-normal text-foreground">
              <span>
                {part.revision}
                {part.iteration ? `.${part.iteration}` : ''}
              </span>
              {isObsolete && (
                <Badge
                  variant="outline"
                  className="text-[11px] font-normal text-amber-400 border-amber-500/40 bg-amber-500/10"
                >
                  Obsolete
                </Badge>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor((row) => row.subassembly || '', {
        id: 'subassembly',
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Subassembly</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => {
          const val = getValue();
          return (
            <span className={cn('text-sm font-normal', val ? 'text-muted-foreground' : 'text-muted-foreground/40')}>
              {val || '—'}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => row.category || '', {
        id: 'category',
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Category</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ getValue }) => {
          const val = getValue();
          return (
            <span className={cn('text-sm font-normal', val ? 'text-muted-foreground' : 'text-muted-foreground/40')}>
              {val || '—'}
            </span>
          );
        },
      }),
      columnHelper.accessor('quantity', {
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer ml-auto"
          >
            <span>Stock</span>
            <ArrowUpDown className="w-3 h-3" />
          </button>
        ),
        cell: ({ row }) => {
          const qty = row.original.quantity;
          return (
            <div className="text-right">
              <span
                className={cn(
                  'text-sm font-normal tabular-nums',
                  qty < 0 ? 'text-amber-400' : 'text-foreground'
                )}
              >
                {qty}
              </span>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'adjust_stock',
        header: () => <span className="sr-only">Adjust Stock</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="default"
              size="xs"
              disabled={isOffline}
              onClick={(e) => {
                e.stopPropagation();
                onAdjustPart(row.original);
              }}
              className="gap-1 text-xs h-7 px-2.5 cursor-pointer"
              title="Take or restock from total part supply"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Adjust</span>
            </Button>
          </div>
        ),
      }),
      columnHelper.display({
        id: 'add_batch',
        header: () => <span className="sr-only">Add Batch</span>,
        cell: ({ row }) => (
          <div className="flex justify-center">
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
              title="Record a new received shipment batch"
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
        header: () => <span className="sr-only">Shipments & Details</span>,
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
                title={isExp ? 'Hide shipment batches' : 'Show shipment batches & details'}
                aria-expanded={isExp}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          );
        },
      }),
    ],
    [isOffline, onAdjustPart, onAddBatch, onEditPart]
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

  // Flatten visible rows + expanded shipment detail rows so each virtual item is 1 <tr>
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
        return 48 + batchCount * 44;
      }
      return 48;
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
                      'px-3 h-10 text-xs',
                      header.id === 'quantity' && 'text-right',
                      (header.id === 'adjust_stock' ||
                        header.id === 'add_batch' ||
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
                      'cursor-pointer h-12',
                      isObsolete && 'opacity-65',
                      isExp && 'bg-muted/35 border-b-0'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'px-3 py-2.5',
                          (cell.column.id === 'adjust_stock' ||
                            cell.column.id === 'add_batch' ||
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

              // Expanded details / received shipment batches
              const { part } = entry;
              return (
                <TableRow
                  key={entry.key}
                  data-index={vRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="bg-muted/15 hover:bg-muted/15"
                >
                  <TableCell colSpan={colCount} className="px-4 py-3 whitespace-normal">
                    <div className="space-y-2.5">
                      {(part.common_name || part.description) && (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {part.common_name && (
                            <div>
                              Formal name:{' '}
                              <span className="text-foreground">{part.name}</span>
                            </div>
                          )}
                          {part.description && <div>{part.description}</div>}
                        </div>
                      )}

                      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Received Shipments ({part.batches.length})
                      </div>

                      {part.batches.length === 0 ? (
                        <div className="flex items-center justify-between text-xs text-muted-foreground py-1">
                          <span>No shipment batches recorded yet.</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={isOffline}
                            onClick={() => onAddBatch(part)}
                            className="gap-1 text-xs h-7 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Record Shipment</span>
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {part.batches.map((batch) => (
                            <div
                              key={batch.id}
                              className="flex flex-col gap-2 px-3 py-2 rounded-lg border border-border/70 bg-background/70 text-xs"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-3 flex-wrap min-w-0">
                                  <span className="font-medium text-foreground">
                                    Batch {batch.batch_number}
                                  </span>

                                  {batch.received_date && (
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <Calendar className="w-3 h-3" />
                                      {batch.received_date}
                                    </span>
                                  )}

                                  {batch.location && (
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <MapPin className="w-3 h-3" />
                                      {batch.location}
                                    </span>
                                  )}

                                  {batch.notes && (
                                    <span className="text-muted-foreground truncate max-w-[260px]">
                                      — {batch.notes}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-muted-foreground tabular-nums">
                                    Received:{' '}
                                    <span className="text-foreground font-medium">
                                      {batch.quantity}
                                    </span>
                                  </span>

                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={isOffline}
                                    onClick={() => onEditBatch(part, batch)}
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                    title="Edit shipment batch details & photos"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>

                              {batch.photo_urls && batch.photo_urls.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {batch.photo_urls.map((url, pIdx) => (
                                    <button
                                      key={pIdx}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onViewPhoto(url);
                                      }}
                                      className="w-12 h-12 rounded-md overflow-hidden border border-border hover:border-primary/70 transition-colors cursor-pointer bg-muted/30 shrink-0"
                                      title="View shipment photo"
                                    >
                                      <img
                                        src={url}
                                        alt={`Shipment photo ${pIdx + 1}`}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
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
