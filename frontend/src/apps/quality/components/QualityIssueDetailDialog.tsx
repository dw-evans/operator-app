import { useState, useRef, useEffect } from 'react';
import type { FC, ChangeEvent } from 'react';
import {
  Camera,
  ImagePlus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  User,
  Calendar,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  updateQualityIssue,
  deleteQualityIssue,
  uploadQualityIssuePhotos,
  deleteQualityIssuePhoto,
} from '../api';
import type { QualityIssue, QualityIssueStatus } from '../types';

interface QualityIssueDetailDialogProps {
  issue: QualityIssue | null;
  onClose: () => void;
  onUpdated: (issue: QualityIssue) => void;
  onDeleted: (issueId: number) => void;
  onViewPhotos: (urls: string[], index: number) => void;
}

export const QualityIssueDetailDialog: FC<QualityIssueDetailDialogProps> = ({
  issue,
  onClose,
  onUpdated,
  onDeleted,
  onViewPhotos,
}) => {
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsEditingDesc(false);
    setDescDraft(issue?.description || '');
    setError(null);
  }, [issue?.id]);

  if (!issue) return null;

  const handleStatusChange = async (nextStatus: QualityIssueStatus) => {
    setIsBusy(true);
    setError(null);
    try {
      const updated = await updateQualityIssue(issue.id, { status: nextStatus });
      onUpdated(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to update status.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveDesc = async () => {
    const trimmed = descDraft.trim();
    if (!trimmed) {
      setError('Description cannot be empty.');
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const updated = await updateQualityIssue(issue.id, { description: trimmed });
      onUpdated(updated);
      setIsEditingDesc(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to update description.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleUploadPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setIsBusy(true);
    setError(null);
    try {
      const updated = await uploadQualityIssuePhotos(issue.id, files);
      onUpdated(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload photos.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeletePhoto = async (filename: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const updated = await deleteQualityIssuePhoto(issue.id, filename);
      onUpdated(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete photo.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteIssue = async () => {
    if (!window.confirm('Delete this quality report permanently?')) return;
    setIsBusy(true);
    setError(null);
    try {
      await deleteQualityIssue(issue.id);
      onDeleted(issue.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete quality report.');
      setIsBusy(false);
    }
  };

  const revLabel = issue.iteration
    ? `${issue.revision}.${issue.iteration}`
    : issue.revision;

  return (
    <Dialog open={Boolean(issue)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{issue.common_name || issue.part_name}</span>
            <Badge variant="outline" className="font-mono text-xs">
              {issue.part_number}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3 text-xs pt-0.5 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(issue.created_at).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </span>
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              {issue.operator}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              {error}
            </div>
          )}

          {/* Part & Batch Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div>
              <div className="text-[11px] text-muted-foreground">Part Name</div>
              <div className="font-medium text-foreground truncate" title={issue.part_name}>
                {issue.part_name}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Revision</div>
              <div className="font-mono text-foreground">{revLabel || '—'}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Batch #</div>
              <div className="font-mono text-foreground">{issue.batch_number || '—'}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Shipment Batch Code</div>
              <div className="font-mono text-foreground">{issue.batch_code || '—'}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Subassembly</div>
              <div className="text-foreground truncate">{issue.subassembly || '—'}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Category</div>
              <div className="text-foreground truncate">{issue.category || '—'}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Status</div>
              <select
                value={issue.status || 'open'}
                onChange={(e) =>
                  handleStatusChange(e.target.value as QualityIssueStatus)
                }
                disabled={isBusy}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="obsolete">Obsolete</option>
              </select>
            </div>
          </div>

          {/* Description Section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Description
              </span>
              {!isEditingDesc && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setDescDraft(issue.description);
                    setIsEditingDesc(true);
                  }}
                  className="gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </Button>
              )}
            </div>

            {isEditingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  rows={4}
                  autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setIsEditingDesc(false)}
                    disabled={isBusy}
                    className="gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Cancel</span>
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    onClick={handleSaveDesc}
                    disabled={isBusy || !descDraft.trim()}
                    className="gap-1 cursor-pointer"
                  >
                    {isBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    <span>Save</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-background p-3 text-sm text-foreground whitespace-pre-wrap break-words">
                {issue.description}
              </div>
            )}
          </div>

          {/* Photos Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Photos ({issue.photo_urls.length})
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleUploadPhotos}
                  className="hidden"
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadPhotos}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isBusy}
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
                  disabled={isBusy}
                  className="gap-1.5 cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Gallery</span>
                </Button>
              </div>
            </div>

            {issue.photo_urls.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No photos attached.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {issue.photo_urls.map((url, idx) => {
                  const filename = issue.photo_filenames[idx];
                  return (
                    <div
                      key={url}
                      className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted"
                    >
                      <button
                        type="button"
                        onClick={() => onViewPhotos(issue.photo_urls, idx)}
                        className="w-full h-full cursor-pointer block"
                        title={`View photo ${idx + 1}`}
                      >
                        <img
                          src={url}
                          alt={`Issue #${issue.id} photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                      {filename && (
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(filename)}
                          disabled={isBusy}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/75 text-white flex items-center justify-center opacity-80 hover:opacity-100 hover:bg-destructive cursor-pointer transition-opacity"
                          title="Delete photo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDeleteIssue}
            disabled={isBusy}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Report</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="cursor-pointer"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
