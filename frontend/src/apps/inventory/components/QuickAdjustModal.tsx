import { useState, useEffect } from 'react';
import type { FC, FormEvent } from 'react';
import { Minus, Plus, Equal, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useOperatorName } from '@/services/settings';
import { adjustBatchStock } from '../api';
import type { InventoryBatch, InventoryPart } from '../types';

interface QuickAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: InventoryPart | null;
  batch: InventoryBatch | null;
  onSuccess: () => void;
}

type AdjustMode = 'take' | 'restock' | 'set';

const TAKE_REASONS = ['Taken for production', 'Prototype / Test', 'Scrap / Damaged'];
const RESTOCK_REASONS = ['Restock / Delivery', 'Returned from production', 'Correction'];

export const QuickAdjustModal: FC<QuickAdjustModalProps> = ({
  open,
  onOpenChange,
  part,
  batch,
  onSuccess,
}) => {
  const [operatorName] = useOperatorName();
  const [mode, setMode] = useState<AdjustMode>('take');
  const [amountStr, setAmountStr] = useState('1');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && batch) {
      setMode('take');
      setAmountStr('1');
      setReason('');
      setError(null);
    }
  }, [open, batch]);

  if (!part || !batch) return null;

  const parsed = parseInt(amountStr, 10);
  const validNum = !Number.isNaN(parsed);

  let computedDelta = 0;
  let previewAfter = batch.quantity;
  if (validNum) {
    if (mode === 'take') {
      computedDelta = -Math.abs(parsed);
      previewAfter = batch.quantity + computedDelta;
    } else if (mode === 'restock') {
      computedDelta = Math.abs(parsed);
      previewAfter = batch.quantity + computedDelta;
    } else {
      previewAfter = parsed;
      computedDelta = parsed - batch.quantity;
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validNum || computedDelta === 0) {
      setError('Enter a non-zero integer change.');
      return;
    }
    const op = operatorName.trim();
    if (!op) {
      setError('Please configure your Operator Name in Settings (top-right ⚙ menu) first.');
      return;
    }

    setIsSaving(true);
    try {
      await adjustBatchStock(batch.id, {
        ...(mode === 'set' ? { set_quantity: previewAfter } : { delta: computedDelta }),
        reason: reason.trim() || undefined,
        operator: op,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to update stock');
    } finally {
      setIsSaving(false);
    }
  };

  const presets = mode === 'take' ? [1, 2, 5, 10, 25] : mode === 'restock' ? [1, 5, 10, 25, 50] : [];
  const reasonChips = mode === 'take' ? TAKE_REASONS : mode === 'restock' ? RESTOCK_REASONS : ['Stocktake count'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>Adjust Stock</span>
            <Badge variant="outline" className="font-mono text-xs">
              {part.part_number} Rev {part.revision}
              {part.iteration ? `.${part.iteration}` : ''}
            </Badge>
          </DialogTitle>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div className="font-medium text-foreground">
              {part.common_name ? `${part.common_name} — ${part.name}` : part.name}
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span>Batch: {batch.batch_number}</span>
              {batch.location && <span>• {batch.location}</span>}
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Mode Switcher */}
          <div className="grid grid-cols-3 gap-1.5 bg-muted/50 p-1 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => {
                setMode('take');
                setAmountStr('1');
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors',
                mode === 'take'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Minus className="w-3.5 h-3.5" />
              <span>Take (-)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('restock');
                setAmountStr('10');
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors',
                mode === 'restock'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Restock (+)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('set');
                setAmountStr(String(batch.quantity));
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors',
                mode === 'set'
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Equal className="w-3.5 h-3.5" />
              <span>Set Exact</span>
            </button>
          </div>

          {/* Quantity Input & Presets */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground block">
              {mode === 'take'
                ? 'Quantity to take'
                : mode === 'restock'
                  ? 'Quantity to add'
                  : 'New exact count'}
            </label>
            <Input
              type="number"
              step={1}
              min={mode === 'set' ? undefined : 1}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="text-base font-mono h-10"
              autoFocus
            />
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {presets.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setAmountStr(String(n))}
                    className="font-mono text-xs cursor-pointer"
                  >
                    {mode === 'take' ? `-${n}` : `+${n}`}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Live Preview */}
          <div
            className={cn(
              'p-2.5 rounded-lg border flex items-center justify-between text-xs font-mono',
              previewAfter < 0
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                : 'bg-muted/30 border-border text-foreground'
            )}
          >
            <span>
              Current: <strong>{batch.quantity}</strong> → New:{' '}
              <strong>{previewAfter}</strong>
            </span>
            <Badge
              variant="outline"
              className={cn(
                'font-mono text-xs',
                computedDelta < 0
                  ? 'text-amber-400 border-amber-500/40'
                  : computedDelta > 0
                    ? 'text-emerald-400 border-emerald-500/40'
                    : 'text-muted-foreground'
              )}
            >
              {computedDelta > 0 ? `+${computedDelta}` : computedDelta}
            </Badge>
          </div>
          {previewAfter < 0 && (
            <p className="text-[11px] text-amber-400 -mt-1.5">
              Count will go negative (allowed — production is not blocked).
            </p>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground block">
              Reason (optional)
            </label>
            <Input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonChips[0]}
              className="h-8 text-xs"
            />
            <div className="flex flex-wrap gap-1">
              {reasonChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setReason(chip)}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border/60 cursor-pointer transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Operator Attribution (read from global top-right Settings menu) */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
            <User className="w-3.5 h-3.5 shrink-0" />
            {operatorName.trim() ? (
              <span>
                Recording as <strong className="text-foreground">{operatorName.trim()}</strong>
              </span>
            ) : (
              <span className="text-amber-400">
                Set your Operator Name in the top-right ⚙ Settings menu before saving.
              </span>
            )}
          </div>

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !validNum || computedDelta === 0}>
              {isSaving ? 'Saving...' : 'Confirm Adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
