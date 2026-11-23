import { useState, useEffect, useRef } from 'react';
import type { FC, FormEvent, ChangeEvent } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useOperatorName } from '@/services/settings';
import {
  createBatch,
  updateBatch,
  uploadBatchPhotos,
  deleteBatchPhoto,
} from '../api';
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

  // Saved photos (in edit mode) & removed filenames queued for deletion on Save
  const [existingPhotos, setExistingPhotos] = useState<
    { filename: string; url: string }[]
  >([]);
  const [removedFilenames, setRemovedFilenames] = useState<string[]>([]);

  // Newly staged photos from Camera or Gallery
  const [newPhotos, setNewPhotos] = useState<{ file: File; preview: string }[]>([]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRemovedFilenames([]);
    setNewPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });

    if (editingBatch) {
      setBatchNumber(editingBatch.batch_number);
      setReceivedDate(editingBatch.received_date || '');
      setLocation(editingBatch.location || '');
      setBatchStatus(editingBatch.batch_status);
      setNotes(editingBatch.notes || '');
      const saved = (editingBatch.photo_urls || []).map((url, idx) => ({
        filename:
          editingBatch.photo_filenames?.[idx] ||
          url.split('/').pop() ||
          `photo_${idx}.jpg`,
        url,
      }));
      setExistingPhotos(saved);
    } else {
      setBatchNumber('');
      setReceivedDate(new Date().toISOString().slice(0, 10));
      setLocation('');
      setInitialQuantity('0');
      setBatchStatus('active');
      setNotes('');
      setExistingPhotos([]);
    }
  }, [open, editingBatch]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      newPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, []);

  if (!part) return null;

  const handleFilesAdded = (
    e: ChangeEvent<HTMLInputElement>,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    const items = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setNewPhotos((prev) => [...prev, ...items]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemoveExistingPhoto = (filename: string) => {
    setExistingPhotos((prev) => prev.filter((p) => p.filename !== filename));
    setRemovedFilenames((prev) => [...prev, filename]);
  };

  const handleRemoveNewPhoto = (index: number) => {
    setNewPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!batchNumber.trim()) {
      setError('Batch # is required.');
      return;
    }

    setIsSaving(true);
    try {
      let savedBatch: InventoryBatch;
      if (editingBatch) {
        savedBatch = await updateBatch(editingBatch.id, {
          batch_number: batchNumber.trim(),
          received_date: receivedDate || null,
          location: location.trim() || null,
          batch_status: batchStatus,
          notes: notes.trim() || null,
        });
      } else {
        const qty = parseInt(initialQuantity, 10);
        savedBatch = await createBatch(part.id, {
          batch_number: batchNumber.trim(),
          received_date: receivedDate || null,
          location: location.trim() || null,
          initial_quantity: Number.isNaN(qty) ? 0 : qty,
          batch_status: batchStatus,
          notes: notes.trim() || null,
          operator: operatorName.trim() || 'Operator',
        });
      }

      // Delete any removed saved photos
      for (const fname of removedFilenames) {
        await deleteBatchPhoto(savedBatch.id, fname);
      }

      // Upload any newly added photos
      if (newPhotos.length > 0) {
        await uploadBatchPhotos(
          savedBatch.id,
          newPhotos.map((p) => p.file)
        );
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
              <label className="text-xs font-medium">Received Quantity</label>
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
              placeholder="e.g. Supplier cert #, delivery note..."
              rows={2}
              className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Shipment Photos: Distinct Camera & Gallery Inputs for Android */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-medium block">Shipment Photos</label>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Direct Camera Capture (Android opens Camera app) */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleFilesAdded(e, cameraInputRef)}
                className="hidden"
                id="batch-photo-camera"
              />
              <label
                htmlFor="batch-photo-camera"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'cursor-pointer gap-1.5 text-xs h-8'
                )}
              >
                <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Take Photo</span>
              </label>

              {/* Multi-Select Gallery Picker (no capture attribute -> Android opens Gallery) */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleFilesAdded(e, galleryInputRef)}
                className="hidden"
                id="batch-photo-gallery"
              />
              <label
                htmlFor="batch-photo-gallery"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'cursor-pointer gap-1.5 text-xs h-8'
                )}
              >
                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span>From Gallery</span>
              </label>
            </div>

            {/* Thumbnails with Delete buttons */}
            {(existingPhotos.length > 0 || newPhotos.length > 0) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {existingPhotos.map((photo) => (
                  <div
                    key={photo.filename}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted/40"
                  >
                    <img
                      src={photo.url}
                      alt="Saved shipment photo"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveExistingPhoto(photo.filename)}
                      className="absolute top-1 right-1 bg-black/80 hover:bg-destructive p-0.5 rounded text-white transition-colors cursor-pointer"
                      title="Delete photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {newPhotos.map((photo, idx) => (
                  <div
                    key={`new-${idx}`}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-primary/50 bg-muted/40"
                  >
                    <img
                      src={photo.preview}
                      alt={`New photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveNewPhoto(idx)}
                      className="absolute top-1 right-1 bg-black/80 hover:bg-destructive p-0.5 rounded text-white transition-colors cursor-pointer"
                      title="Remove photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
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
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingBatch ? 'Save Batch' : 'Add Batch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
