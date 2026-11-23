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
import { useOperatorName } from '@/services/settings';
import { createPart, updatePart } from '../api';
import type { CommonNameItem, InventoryPart, LifecycleStatus } from '../types';

interface AddEditPartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPart: InventoryPart | null;
  commonNames: CommonNameItem[];
  onSuccess: () => void;
}

export const AddEditPartModal: FC<AddEditPartModalProps> = ({
  open,
  onOpenChange,
  editingPart,
  commonNames,
  onSuccess,
}) => {
  const [operatorName] = useOperatorName();
  const [partNumber, setPartNumber] = useState('');
  const [revision, setRevision] = useState('1');
  const [iteration, setIteration] = useState('');
  const [name, setName] = useState('');
  const [commonName, setCommonName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [lifecycleStatus, setLifecycleStatus] = useState<LifecycleStatus>('active');

  // Optional initial batch fields when creating a new part
  const [initialBatchNumber, setInitialBatchNumber] = useState('');
  const [initialReceivedDate, setInitialReceivedDate] = useState('');
  const [initialLocation, setInitialLocation] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingPart) {
      setPartNumber(editingPart.part_number);
      setRevision(editingPart.revision);
      setIteration(editingPart.iteration || '');
      setName(editingPart.name);
      setCommonName(editingPart.common_name || '');
      setCategory(editingPart.category || '');
      setDescription(editingPart.description || '');
      setUnit(editingPart.unit || 'pcs');
      setLifecycleStatus(editingPart.lifecycle_status);
    } else {
      setPartNumber('');
      setRevision('1');
      setIteration('');
      setName('');
      setCommonName('');
      setCategory('');
      setDescription('');
      setUnit('pcs');
      setLifecycleStatus('active');
      setInitialBatchNumber('');
      setInitialReceivedDate(new Date().toISOString().slice(0, 10));
      setInitialLocation('');
      setInitialQuantity('0');
    }
  }, [open, editingPart]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!partNumber.trim() || !name.trim() || !revision.trim()) {
      setError('Part Number, Revision, and Name are required.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingPart) {
        await updatePart(editingPart.id, {
          part_number: partNumber.trim(),
          revision: revision.trim(),
          iteration: iteration.trim(),
          name: name.trim(),
          common_name: commonName.trim(),
          category: category.trim(),
          description: description.trim(),
          unit: unit.trim() || 'pcs',
          lifecycle_status: lifecycleStatus,
        });
      } else {
        const qty = parseInt(initialQuantity, 10);
        await createPart({
          part_number: partNumber.trim(),
          revision: revision.trim(),
          iteration: iteration.trim(),
          name: name.trim(),
          common_name: commonName.trim() || null,
          category: category.trim() || null,
          description: description.trim() || null,
          unit: unit.trim() || 'pcs',
          lifecycle_status: lifecycleStatus,
          initial_batch_number: initialBatchNumber.trim() || null,
          initial_received_date: initialReceivedDate || null,
          initial_location: initialLocation.trim() || null,
          initial_quantity: Number.isNaN(qty) ? 0 : qty,
          operator: operatorName.trim() || 'Operator',
        });
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save part');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingPart ? 'Edit Part Version' : 'Add New Part / Version'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-6 space-y-1">
              <label className="text-xs font-medium">Part Number *</label>
              <Input
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="e.g. PN-1042"
                className="h-8 text-xs font-mono"
                required
              />
            </div>
            <div className="col-span-3 space-y-1">
              <label className="text-xs font-medium">Revision *</label>
              <Input
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                placeholder="1"
                className="h-8 text-xs font-mono"
                required
              />
            </div>
            <div className="col-span-3 space-y-1">
              <label className="text-xs font-medium">Iteration</label>
              <Input
                value={iteration}
                onChange={(e) => setIteration(e.target.value)}
                placeholder="0"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-medium">Formal Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Left Side Bracket M6"
                className="h-8 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Common Name (Shop-Floor)</label>
              <Input
                list="inventory-common-names"
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
                placeholder="Pick existing or type new..."
                className="h-8 text-xs"
              />
              <datalist id="inventory-common-names">
                {commonNames.map((cn) => (
                  <option key={cn.id} value={cn.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-medium">Category</label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Fasteners, PCB..."
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Unit</label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs"
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Version Status</label>
              <select
                value={lifecycleStatus}
                onChange={(e) => setLifecycleStatus(e.target.value as LifecycleStatus)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                <option value="active">Active</option>
                <option value="obsolete">Obsolete</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes, specs, supplier info..."
              rows={2}
              className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {!editingPart && (
            <div className="pt-2 border-t border-border space-y-2.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Initial Batch (Optional)
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Batch #</label>
                  <Input
                    value={initialBatchNumber}
                    onChange={(e) => setInitialBatchNumber(e.target.value)}
                    placeholder="e.g. LOT-2026-01"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Received Date</label>
                  <Input
                    type="date"
                    value={initialReceivedDate}
                    onChange={(e) => setInitialReceivedDate(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Location / Bin</label>
                  <Input
                    value={initialLocation}
                    onChange={(e) => setInitialLocation(e.target.value)}
                    placeholder="e.g. Shelf B-4"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Opening Count</label>
                  <Input
                    type="number"
                    step={1}
                    value={initialQuantity}
                    onChange={(e) => setInitialQuantity(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

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
              {isSaving ? 'Saving...' : editingPart ? 'Save Changes' : 'Create Part'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
