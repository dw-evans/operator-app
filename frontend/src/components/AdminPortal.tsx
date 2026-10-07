import { useState, useEffect } from 'react';
import type { FC, FormEvent } from 'react';
import {
  Upload,
  History,
  CheckCircle2,
  Download,
  X,
  Lock,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import type { DocumentRevision, FeedbackItem, SlotSummary } from '../types';
import {
  fetchSlots,
  fetchSlotHistory,
  adminUploadManual,
  checkPinStatus,
  verifyPin,
  fetchSlotFeedback,
  updateFeedbackStatus,
} from '../services/api';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

interface AdminPortalProps {
  onClose: () => void;
  onSlotsUpdated: () => void;
}

export const AdminPortal: FC<AdminPortalProps> = ({ onClose, onSlotsUpdated }) => {
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Selected slot for revision history modal
  const [historySlotId, setHistorySlotId] = useState<number | null>(null);
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Upload state per slot
  const [uploadingSlotId, setUploadingSlotId] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Feedback audit state
  const [auditSlotId, setAuditSlotId] = useState<number | null>(null);
  const [auditFeedback, setAuditFeedback] = useState<FeedbackItem[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  useEffect(() => {
    checkPin();
    loadSlots();
  }, []);

  const checkPin = async () => {
    try {
      const res = await checkPinStatus();
      if (res.pin_required) {
        const sessionUnlocked = sessionStorage.getItem('assembly_admin_unlocked') === 'true';
        setIsPinLocked(!sessionUnlocked);
      } else {
        setIsPinLocked(false);
      }
    } catch {
      setIsPinLocked(false);
    }
  };

  const handleVerifyPin = async (e: FormEvent) => {
    e.preventDefault();
    setPinError(null);
    try {
      const res = await verifyPin(pinInput);
      if (res.valid) {
        setIsPinLocked(false);
        sessionStorage.setItem('assembly_admin_unlocked', 'true');
      } else {
        setPinError('Incorrect PIN. Please try again.');
      }
    } catch {
      setPinError('Failed to verify PIN with server.');
    }
  };

  const loadSlots = async () => {
    setIsLoadingSlots(true);
    try {
      const data = await fetchSlots();
      setSlots(data);
    } catch (err) {
      console.error('Failed to load slots in admin:', err);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleUpload = async (slotId: number, file: File) => {
    setUploadingSlotId(slotId);
    setUploadSuccess(null);

    try {
      await adminUploadManual(slotId, file);
      setUploadSuccess(`Slot ${slotId} updated with ${file.name}`);
      await loadSlots();
      onSlotsUpdated();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingSlotId(null);
    }
  };

  const openHistory = async (slotId: number) => {
    setHistorySlotId(slotId);
    setIsLoadingHistory(true);
    try {
      const history = await fetchSlotHistory(slotId);
      setRevisions(history);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const openAudit = async (slotId: number) => {
    setAuditSlotId(slotId);
    setIsLoadingAudit(true);
    try {
      const items = await fetchSlotFeedback(slotId);
      setAuditFeedback(items);
    } catch (err) {
      console.error('Failed to load audit feedback:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleUpdateStatus = async (fbId: string, newStatus: 'open' | 'reviewed' | 'resolved') => {
    try {
      await updateFeedbackStatus(fbId, newStatus);
      setAuditFeedback((prev) =>
        prev.map((item) => (item.id === fbId ? { ...item, status: newStatus } : item))
      );
      await loadSlots();
      onSlotsUpdated();
    } catch {
      alert('Failed to update status');
    }
  };

  if (isPinLocked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Lock className="mx-auto h-8 w-8 text-muted-foreground mb-1" />
            <CardTitle>Admin PIN Required</CardTitle>
            <CardDescription>Enter PIN to access document management.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyPin} className="space-y-4">
              <Input
                type="password"
                autoFocus
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="PIN"
                className="text-center text-lg tracking-widest font-mono"
              />
              {pinError && <p className="text-xs text-destructive text-center">{pinError}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-1/2" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" className="w-1/2">
                  Unlock
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between pb-4 border-b">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Management Portal</h1>
            <Badge variant="outline">Slots 1–10</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage PDF instruction manuals and audit station feedback notes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSlots} disabled={isLoadingSlots}>
            <RefreshCw className={`h-4 w-4 ${isLoadingSlots ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {uploadSuccess && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{uploadSuccess}</AlertDescription>
        </Alert>
      )}

      {/* 10 Slots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {slots.map((slot) => {
          const doc = slot.live_document;
          const isSlotUploading = uploadingSlotId === slot.slot_id;

          return (
            <Card key={slot.slot_id} className="flex flex-col justify-between">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">Slot {slot.slot_id}</Badge>
                  {doc ? (
                    <Badge variant="secondary">v{doc.version}</Badge>
                  ) : (
                    <Badge variant="outline">Empty</Badge>
                  )}
                </div>
                <CardTitle className="text-base truncate pt-1">
                  {doc ? doc.title : 'Empty Slot'}
                </CardTitle>
                <CardDescription className="text-xs truncate">
                  {doc ? `Uploaded ${new Date(doc.upload_date).toLocaleDateString()}` : 'No PDF deployed'}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-2 py-2">
                {doc && (
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
                    <span className="font-mono text-[11px] truncate max-w-[120px]">
                      {doc.file_hash}
                    </span>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: 'link', size: 'xs' })}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      PDF
                    </a>
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col gap-2 pt-2">
                <input
                  type="file"
                  accept="application/pdf"
                  id={`file-${slot.slot_id}`}
                  className="hidden"
                  disabled={isSlotUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(slot.slot_id, file);
                    e.target.value = '';
                  }}
                />
                <label
                  htmlFor={`file-${slot.slot_id}`}
                  className={buttonVariants({
                    variant: 'outline',
                    size: 'sm',
                    className: 'w-full cursor-pointer justify-center',
                  })}
                >
                  <Upload className={`h-3.5 w-3.5 mr-1 ${isSlotUploading ? 'animate-bounce' : ''}`} />
                  {isSlotUploading ? 'Uploading...' : doc ? 'Replace PDF' : 'Upload PDF'}
                </label>

                <div className="flex w-full gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs px-2"
                    onClick={() => openHistory(slot.slot_id)}
                  >
                    <History className="h-3.5 w-3.5 mr-1" />
                    History ({slot.total_revisions})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs px-2"
                    onClick={() => openAudit(slot.slot_id)}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    Notes ({slot.total_feedback})
                  </Button>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Revision History Dialog */}
      <Dialog
        open={historySlotId !== null}
        onOpenChange={(open) => !open && setHistorySlotId(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Slot {historySlotId} Revisions</DialogTitle>
            <DialogDescription>
              Complete version log for Slot {historySlotId}.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 mt-2">
            {isLoadingHistory ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Loading revisions...
              </p>
            ) : revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No revisions found.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revisions.map((rev) => (
                    <TableRow key={rev.id}>
                      <TableCell className="font-medium">v{rev.version}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {rev.title}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(rev.upload_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {rev.is_live ? (
                          <Badge variant="default">Live</Badge>
                        ) : (
                          <Badge variant="secondary">Obsolete</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <a
                          href={rev.url}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Feedback Audit Dialog */}
      <Dialog
        open={auditSlotId !== null}
        onOpenChange={(open) => !open && setAuditSlotId(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Slot {auditSlotId} Feedback Notes</DialogTitle>
            <DialogDescription>
              Operator notes and issues reported for Slot {auditSlotId}.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 mt-2">
            {isLoadingAudit ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Loading notes...
              </p>
            ) : auditFeedback.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No notes submitted for this slot yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Station / Author</TableHead>
                    <TableHead>Page</TableHead>
                    <TableHead>Comment</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditFeedback.map((fb) => (
                    <TableRow key={fb.id}>
                      <TableCell>
                        <div className="font-medium text-xs">{fb.station_id}</div>
                        <div className="text-[11px] text-muted-foreground">{fb.author}</div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">P.{fb.page_ref}</TableCell>
                      <TableCell className="max-w-xs text-xs">
                        <p className="line-clamp-2">{fb.text_comment}</p>
                        <div className="flex gap-2 text-[11px] text-muted-foreground mt-1">
                          {fb.photo_urls && fb.photo_urls.length > 0 && (
                            <span>📷 {fb.photo_urls.length} photo(s)</span>
                          )}
                          {Boolean(fb.video_url || fb.video_filename) && <span>🎥 video</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={fb.status}
                            onChange={(e) => handleUpdateStatus(fb.id, e.target.value as any)}
                            className="text-xs border rounded px-1.5 py-0.5 bg-background text-foreground"
                          >
                            <option value="open">Open</option>
                            <option value="reviewed">Reviewed</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
