import { useState } from 'react';
import type { FC } from 'react';
import { PdfJsViewer } from './PdfJsViewer';
import { FeedbackEngine } from './FeedbackEngine';
import { FeedbackStream } from './FeedbackStream';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { X, MessageSquare, PlusCircle, AlertCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentRevision } from '../types';

interface SlotViewerVariantProps {
  slotId: number;
  document: DocumentRevision | null;
  totalFeedbackCount: number;
  onFeedbackSubmitted: () => void;
}

export const SlotViewerVariant: FC<SlotViewerVariantProps> = ({
  slotId,
  document,
  totalFeedbackCount,
  onFeedbackSubmitted,
}) => {
  const [activePage, setActivePage] = useState<number>(1);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'submit' | 'stream'>('submit');

  if (!document) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center bg-background">
        <Card className="max-w-md p-8 text-center border-border shadow-sm">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg text-foreground">
            No Manual Uploaded
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Slot {slotId} does not currently have an active instruction manual PDF.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative w-full h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
      {/* Fullscreen PDF.js Viewer */}
      <PdfJsViewer
        url={document.url}
        title={`Slot ${slotId}: ${document.title} (v${document.version})`}
        slotId={slotId}
        initialPage={activePage}
        onPageChange={(page) => setActivePage(page)}
        onOpenNotes={() => setIsNotesOpen(true)}
        notesCount={totalFeedbackCount}
      />

      {/* Notes & Comments Popover / Slide-over Drawer */}
      {isNotesOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop (no blur so PDF remains sharp and visible) */}
          <div
            className="fixed inset-0 bg-black/25 transition-opacity animate-in fade-in-0 duration-200"
            onClick={() => setIsNotesOpen(false)}
          />

          {/* Drawer Container: Fullscreen on mobile, max-width on landscape/desktop */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Station Notes and Comments"
            className={cn(
              'relative z-50 flex flex-col bg-card border-border shadow-2xl transition-all duration-200 overflow-hidden',
              // Mobile: Covers the whole screen
              'inset-0 w-full h-full',
              // Desktop / Tablet landscape: Docked right slide-over with maximum width
              'md:inset-y-0 md:right-0 md:left-auto md:w-full md:max-w-lg lg:max-w-xl md:border-l md:rounded-l-2xl'
            )}
          >
            {/* Drawer Header */}
            <header className="px-4 py-3.5 border-b border-border bg-card flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      Station Notes & Discrepancies
                    </h2>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      Slot {slotId}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Currently viewing page <span className="font-mono font-medium text-foreground">{activePage}</span>
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsNotesOpen(false)}
                title="Close Notes"
                className="cursor-pointer"
              >
                <X className="w-4 h-4" />
              </Button>
            </header>

            {/* Tab Navigation */}
            <div className="p-3 border-b border-border bg-muted/20 shrink-0">
              <div className="flex bg-muted/60 p-1 rounded-xl border border-border">
                <button
                  onClick={() => setActiveTab('submit')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                    activeTab === 'submit'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Submit Note</span>
                </button>

                <button
                  onClick={() => setActiveTab('stream')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                    activeTab === 'stream'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>All Notes</span>
                  {totalFeedbackCount > 0 && (
                    <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px]">
                      {totalFeedbackCount}
                    </Badge>
                  )}
                </button>
              </div>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-background/50">
              {activeTab === 'submit' ? (
                <FeedbackEngine
                  slotId={slotId}
                  initialPageRef={activePage}
                  onFeedbackSubmitted={() => {
                    onFeedbackSubmitted();
                    setActiveTab('stream');
                  }}
                />
              ) : (
                <FeedbackStream slotId={slotId} />
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
