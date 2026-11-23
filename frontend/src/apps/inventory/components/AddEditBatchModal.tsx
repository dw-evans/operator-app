import { useState, useEffect } from 'react';
import type { FC, FormEvent } from 'react';
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
import { useOperatorName } from '@/services/settings';
import { createBatch, updateBatch } from '../api';
import type { BatchStatus, InventoryBatch, InventoryPart } from '../types';

interface AddEditBatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  part: InventoryPart | null;
  editingBatch: InventoryBatch | null;
  onSuccess: () => void;
}

export const AddEditBatchModal: FC<AddEditBatchModalProps> = ({
  open,
  onOpenChange,
  part,
  editingBatch,
  onSuccess,
}) => {
  const [operatorName] = useOperatorName();
  const [batchNumber, setBatchNumber] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [location, setLocation] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [batchStatus, setBatchStatus] = useState<BatchStatus>('active');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingBatch) {
      setBatchNumber(editingBatch.batch_number);
      setReceivedDate(editingBatch.received_date || '');
      setLocation(editingBatch.location || '');
      setBatchStatus(editingBatch.batch_status);
      setNotes(editingBatch.notes || '');
    } else {
      setBatchNumber('');
      setReceivedDate(new Date().toISOString().slice(0, 10));
      setLocation('');
      setInitialQuantity('0');
      setBatchStatus('active');
      setNotes('');
    }
  }, [open, editingBatch]);

  if (!part) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!batchNumber.trim()) {
      setError('Batch # is required.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingBatch) {
        await updateBatch(editingBatch.id, {
          batch_number: batchNumber.trim(),
          received_date: receivedDate || null,
          location: location.trim() || null,
          batch_status: batchStatus,
          notes: notes.trim() || null,
        });
      } else {
        const qty = parseInt(initialQuantity, 10);
        await createBatch(part.id, {
          batch_number: batchNumber.trim(),
          received_date: receivedDate || null,
          location: location.trim() || null,
          initial_quantity: Number.isNaN(qty) ? 0 : qty,
          batch_status: batchStatus,
          notes: notes.trim() || null,
          operator: operatorName.trim() || 'Operator',
        });
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save batch');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{editingBatch ? 'Edit Batch' : 'Add Received Batch'}</span>
            <Badge variant="outline" className="font-mono text-xs">
              {part.part_number} Rev {part.revision}
              {part.iteration ? `.${part.iteration}` : ''}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-medium">Batch # *</label>
              <Input
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g. LOT-2026-11A"
                className="h-8 text-xs font-mono"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Received Date</label>
              <Input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-medium">Location / Bin</label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bin C-3"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Batch Status</label>
              <select
                value={batchStatus}
                onChange={(e) => setBatchStatus(e.target.value as BatchStatus)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                <option value="active">Active</option>
                <option value="depleted">Depleted</option>
              </select>
            </div>
          </div>

          {!editingBatch && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Initial Quantity</label>
              <Input
                type="number"
                step={1}
                value={initialQuantity}
                onChange={(e) => setInitialQuantity(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">Batch Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Supplier cert #, quarantine reason..."
              rows={2}
              className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
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
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingBatch ? 'Save Batch' : 'Add Batch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
