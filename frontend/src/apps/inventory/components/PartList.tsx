import { useMemo } from 'react';
import type { FC } from 'react';
import {
  Plus,
  Pencil,
  SlidersHorizontal,
  Package,
  Calendar,
  MapPin,
} from 'lucide-react';
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
  const displayParts = useMemo(() => {
    // Preserve server fuzzy-relevance order while actively searching
    if (isSearching) return parts;
    return [...parts].sort((a, b) => {
      if (a.lifecycle_status !== b.lifecycle_status) {
        return a.lifecycle_status === 'active' ? -1 : 1;
      }
      const nameA = (a.common_name || a.name).toLowerCase();
      const nameB = (b.common_name || b.name).toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      if (a.part_number !== b.part_number) return a.part_number.localeCompare(b.part_number);
      return b.revision.localeCompare(a.revision);
    });
  }, [parts, isSearching]);

  if (isLoading && parts.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Loading inventory...
      </div>
    );
  }

  if (displayParts.length === 0) {
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

  return (
    <div className="space-y-3">
      {displayParts.map((part) => {
        const isObsolete = part.lifecycle_status === 'obsolete';

        return (
          <Card
            key={part.id}
            className={cn(
              'p-3.5 sm:p-4 space-y-3 transition-colors',
              isObsolete && 'opacity-75 border-amber-500/30 bg-amber-950/10'
            )}
          >
            {/* Part Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm sm:text-base text-foreground">
                    {part.common_name || part.name}
                  </span>
                  <Badge variant="outline" className="font-mono text-[11px] font-bold">
                    {part.part_number}
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    Rev {part.revision}
                    {part.iteration ? ` · Iter ${part.iteration}` : ''}
                  </Badge>
                  {part.category && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {part.category}
                    </Badge>
                  )}
                  {isObsolete && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase font-mono bg-amber-500/15 text-amber-400 border-amber-500/40"
                    >
                      Obsolete Version
                    </Badge>
                  )}
                </div>

                {part.common_name && (
                  <div className="text-xs text-muted-foreground">
                    Formal name: <span className="text-foreground/80">{part.name}</span>
                  </div>
                )}

                {part.description && (
                  <p className="text-xs text-muted-foreground/90">{part.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <div className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Active Stock
                  </div>
                  <div
                    className={cn(
                      'font-mono text-sm font-bold',
                      part.total_active_quantity < 0
                        ? 'text-amber-400'
                        : 'text-foreground'
                    )}
                  >
                    {part.total_active_quantity}{' '}
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {part.unit}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isOffline}
                  onClick={() => onAddBatch(part)}
                  className="gap-1 text-xs h-8 cursor-pointer"
                  title="Add a new received batch for this part version"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Batch</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isOffline}
                  onClick={() => onEditPart(part)}
                  title="Edit part version metadata / obsolete status"
                  className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Batches List */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              {part.batches.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-1">
                  No batches recorded yet.
                </div>
              ) : (
                part.batches.map((batch) => {
                  const isDepleted = batch.batch_status === 'depleted';
                  return (
                    <div
                      key={batch.id}
                      className={cn(
                        'flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs',
                        isDepleted
                          ? 'bg-muted/20 border-border/60 opacity-70'
                          : 'bg-muted/25 border-border/70'
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
                          <span className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                            — {batch.notes}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            'font-mono font-bold text-sm min-w-[3.5rem] text-right',
                            batch.quantity < 0 ? 'text-amber-400' : 'text-foreground'
                          )}
                        >
                          {batch.quantity}{' '}
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {part.unit}
                          </span>
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
                })
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
