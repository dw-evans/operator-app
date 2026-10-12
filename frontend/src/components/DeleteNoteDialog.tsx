import type { FC } from 'react';
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { FeedbackItem } from '../types';

interface DeleteNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: FeedbackItem | null;
  onConfirmDelete: () => Promise<void> | void;
  isDeleting?: boolean;
}

export const DeleteNoteDialog: FC<DeleteNoteDialogProps> = ({
  open,
  onOpenChange,
  note,
  onConfirmDelete,
  isDeleting = false,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border bg-card">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-2.5 text-destructive">
            <div className="p-2 rounded-full bg-destructive/15 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle className="text-base sm:text-lg font-semibold text-foreground">
              Delete Note
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground pt-1 leading-relaxed">
            Are you sure you want to delete this note
            {note?.author ? (
              <> by <strong className="text-foreground">{note.author}</strong></>
            ) : null}
            {note?.page_ref ? (
              <> on <span className="font-mono text-foreground font-medium">Page {note.page_ref}</span></>
            ) : null}
            ? The note and its pin will be removed from this manual.
          </DialogDescription>
          {note?.text_comment && (
            <div className="mt-2 p-2.5 bg-muted/40 rounded-lg border border-border/60 text-xs text-foreground/80 italic line-clamp-3">
              "{note.text_comment}"
            </div>
          )}
        </DialogHeader>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="cursor-pointer text-xs h-8"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="gap-1.5 cursor-pointer text-xs h-8 shadow-sm"
          >
            {isDeleting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            <span>{isDeleting ? 'Deleting...' : 'Delete Note'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
