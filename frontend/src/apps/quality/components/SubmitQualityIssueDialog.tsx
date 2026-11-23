import { useState, useMemo, useEffect, useRef } from 'react';
import type { FC, FormEvent, ChangeEvent } from 'react';
import { Camera, ImagePlus, X, Search, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useOperatorName } from '@/services/settings';
import type { InventoryPart } from '@/apps/inventory/types';
import { createQualityIssue, uploadQualityIssuePhotos } from '../api';
import type { QualityIssue } from '../types';

interface SubmitQualityIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parts: InventoryPart[];
  onCreated: (issue: QualityIssue) => void;
}

interface PendingPhoto {
  file: File;
  previewUrl: string;
}

export const SubmitQualityIssueDialog: FC<SubmitQualityIssueDialogProps> = ({
  open,
  onOpenChange,
  parts,
  onCreated,
}) => {
  const [operatorName] = useOperatorName();
  const [partSearch, setPartSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>(''); // '' = None
  const [description, setDescription] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const comboboxRef = useRef<HTMLDivElement>(null);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      pendingPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPartSearch('');
      setDropdownOpen(false);
      setSelectedPartId(null);
      setSelectedBatchId('');
      setDescription('');
      setPendingPhotos([]);
      setError(null);
      setIsSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close combobox dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedPart = useMemo(
    () => parts.find((p) => p.id === selectedPartId) || null,
    [parts, selectedPartId]
  );

  // Sibling variants sharing the same part_number (e.g. different Batch # 1/2/3 or revisions)
  const siblingVariants = useMemo(() => {
    if (!selectedPart) return [];
    return parts
      .filter((p) => p.part_number === selectedPart.part_number)
      .sort((a, b) => {
        const batchCmp = (a.batch_number || '').localeCompare(b.batch_number || '', undefined, {
          numeric: true,
        });
        if (batchCmp !== 0) return batchCmp;
        return a.revision.localeCompare(b.revision, undefined, { numeric: true });
      });
  }, [parts, selectedPart]);

  // Filter parts by Name, Common Name, or Part Number
  const filteredParts = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    if (!q) return parts.slice(0, 40);
    return parts
      .filter((p) => {
        const hay = `${p.name} ${p.common_name || ''} ${p.part_number} ${p.batch_number || ''} ${p.subassembly || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [parts, partSearch]);

  const handleSelectPart = (part: InventoryPart) => {
    setSelectedPartId(part.id);
    setSelectedBatchId('');
    setPartSearch(`${part.common_name || part.name} (${part.part_number})`);
    setDropdownOpen(false);
  };

  const handleFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const added: PendingPhoto[] = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingPhotos((prev) => [...prev, ...added]);
    e.target.value = '';
  };

  const handleRemovePhoto = (index: number) => {
    setPendingPhotos((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPart) {
      setError('Please select a part from inventory.');
      return;
    }
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setError('Please enter a description of the quality issue.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      let created = await createQualityIssue({
        part_id: selectedPart.id,
        part_batch_id: selectedBatchId ? parseInt(selectedBatchId, 10) : null,
        description: trimmedDesc,
        operator: (operatorName || '').trim() || 'Operator',
      });

      if (pendingPhotos.length > 0) {
        created = await uploadQualityIssuePhotos(
          created.id,
          pendingPhotos.map((p) => p.file)
        );
      }

      onCreated(created);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit quality issue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = Boolean(selectedPart && description.trim().length > 0 && !isSubmitting);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report Quality Issue</DialogTitle>
          <DialogDescription>
            Link a quality report to a part (and optionally a specific received shipment batch).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              {error}
            </div>
          )}

          {/* Step 1: Quick Part Search (Name or Part Number) */}
          <div className="space-y-1.5" ref={comboboxRef}>
            <label htmlFor="quality-part-search" className="text-xs font-medium block">
              Part (Name or Part Number) <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                id="quality-part-search"
                value={partSearch}
                onChange={(e) => {
                  setPartSearch(e.target.value);
                  setDropdownOpen(true);
                  if (selectedPartId !== null) {
                    setSelectedPartId(null);
                    setSelectedBatchId('');
                  }
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Type part name or part number..."
                className="pl-8 pr-8 h-9 text-sm"
                autoComplete="off"
              />
              {partSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setPartSearch('');
                    setSelectedPartId(null);
                    setSelectedBatchId('');
                    setDropdownOpen(true);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Clear selection"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1">
                  {filteredParts.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No matching parts found in inventory.
                    </div>
                  ) : (
                    filteredParts.map((part) => {
                      const isSelected = part.id === selectedPartId;
                      return (
                        <button
                          key={part.id}
                          type="button"
                          onClick={() => handleSelectPart(part)}
                          className={cn(
                            'w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-muted/70 cursor-pointer transition-colors',
                            isSelected && 'bg-muted'
                          )}
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate">
                              {part.common_name || part.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-2 flex-wrap">
                              <span>{part.part_number}</span>
                              <span>
                                Rev {part.revision}
                                {part.iteration ? `.${part.iteration}` : ''}
                              </span>
                              {part.batch_number && (
                                <span className="text-foreground/80">
                                  Batch {part.batch_number}
                                </span>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: If multiple Batch # / Revisions exist for this part number, let user switch easily */}
          {selectedPart && siblingVariants.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium block">
                Batch Identifier / Revision
              </label>
              <div className="flex flex-wrap gap-1.5">
                {siblingVariants.map((variant) => {
                  const active = variant.id === selectedPart.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => {
                        setSelectedPartId(variant.id);
                        setSelectedBatchId('');
                      }}
                      className={cn(
                        'px-2.5 py-1 rounded-md border text-xs font-mono transition-colors cursor-pointer',
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
                      )}
                    >
                      {variant.batch_number ? `Batch ${variant.batch_number}` : 'No Batch'} · Rev{' '}
                      {variant.revision}
                      {variant.iteration ? `.${variant.iteration}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Part Summary Strip */}
          {selectedPart && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono font-medium text-foreground">
                {selectedPart.part_number}
              </span>
              <span className="text-muted-foreground">
                Rev {selectedPart.revision}
                {selectedPart.iteration ? `.${selectedPart.iteration}` : ''}
              </span>
              {selectedPart.batch_number && (
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                  Batch {selectedPart.batch_number}
                </Badge>
              )}
              {selectedPart.subassembly && (
                <span className="text-muted-foreground">{selectedPart.subassembly}</span>
              )}
              {selectedPart.category && (
                <span className="text-muted-foreground">· {selectedPart.category}</span>
              )}
            </div>
          )}

          {/* Step 3: Optional Shipment Batch */}
          {selectedPart && (
            <div className="space-y-1.5">
              <label htmlFor="quality-shipment-batch" className="text-xs font-medium block">
                Shipment Batch (Optional)
              </label>
              <select
                id="quality-shipment-batch"
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">None (general part issue)</option>
                {selectedPart.batches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.batch_number}
                    {b.received_date ? ` · ${b.received_date}` : ''}
                    {b.location ? ` · ${b.location}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Step 4: Required Description */}
          <div className="space-y-1.5">
            <label htmlFor="quality-description" className="text-xs font-medium block">
              Issue Description <span className="text-destructive">*</span>
            </label>
            <textarea
              id="quality-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe the defect, measurement deviation, or quality concern..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              required
            />
          </div>

          {/* Step 5: Optional Photos (Camera + Gallery) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Photos (Optional)</label>
              <div className="flex items-center gap-1.5">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFilesSelected}
                  className="hidden"
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFilesSelected}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => cameraInputRef.current?.click()}
                  className="gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Camera</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => galleryInputRef.current?.click()}
                  className="gap-1.5 cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Gallery</span>
                </Button>
              </div>
            </div>

            {pendingPhotos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingPhotos.map((photo, idx) => (
                  <div
                    key={photo.previewUrl}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted"
                  >
                    <img
                      src={photo.previewUrl}
                      alt={`Upload preview ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black cursor-pointer"
                      title="Remove photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2">
            <span className="text-[11px] text-muted-foreground">
              Reporting as <strong className="text-foreground">{operatorName || 'Operator'}</strong>
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit} className="cursor-pointer gap-1.5">
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Submit Report</span>
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
