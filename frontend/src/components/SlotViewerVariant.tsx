import { useState, useEffect, useMemo, useCallback } from 'react';
import type { FC } from 'react';
import { PdfiumViewer } from './PdfiumViewer';
import { FeedbackEngine } from './FeedbackEngine';
import { FeedbackStream } from './FeedbackStream';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { X, MessageSquare, PlusCircle, AlertCircle, FileText, MapPin, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentRevision, FeedbackItem, PdfPin } from '../types';
import { fetchSlotFeedback } from '../services/api';

interface SlotViewerVariantProps {
  slotId: number;
  document: DocumentRevision | null;
  totalFeedbackCount?: number;
  onFeedbackSubmitted?: () => void;
}

export const SlotViewerVariant: FC<SlotViewerVariantProps> = ({
  slotId,
  document,
  totalFeedbackCount = 0,
  onFeedbackSubmitted,
}) => {
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'submit' | 'stream'>('submit');
  const [activePage, setActivePage] = useState<number>(1);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [hasLoadedFeedback, setHasLoadedFeedback] = useState(false);
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [draftPin, setDraftPin] = useState<{ pageNumber: number; x: number; y: number } | null>(null);
  const [showPins, setShowPins] = useState(true);
  const [highlightedFeedbackId, setHighlightedFeedbackId] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    try {
      const items = await fetchSlotFeedback(slotId, document?.id);
      setFeedbackList(items);
      setHasLoadedFeedback(true);
    } catch (err) {
      console.warn('Could not fetch feedback for slot pins:', err);
    }
  }, [slotId, document?.id]);

  useEffect(() => {
    setHasLoadedFeedback(false);
    loadFeedback();
  }, [loadFeedback]);

  // Notes specifically relevant to this document revision
  const relevantFeedback = useMemo(() => {
    if (!document?.id) return feedbackList;
    return feedbackList.filter((fb) => !fb.document_id || fb.document_id === document.id);
  }, [feedbackList, document?.id]);

  // Display note count reflects current document once loaded, or slot summary initial count
  const noteCount = useMemo(() => {
    if (hasLoadedFeedback) {
      return relevantFeedback.length;
    }
    return totalFeedbackCount;
  }, [hasLoadedFeedback, relevantFeedback.length, totalFeedbackCount]);

  // Map feedback items and draft pin to pins for PdfiumViewer
  const pins: PdfPin[] = useMemo(() => {
    const list: PdfPin[] = relevantFeedback.map((fb) => ({
      id: fb.id,
      pageNumber: fb.page_ref,
      x: fb.pin_x ?? 0,
      y: fb.pin_y ?? 0,
      author: fb.author,
      comment: fb.text_comment || undefined,
      sectionRef: fb.section_ref || undefined,
      stationId: fb.station_id,
      timestamp: fb.timestamp,
      status: fb.status,
      photoUrls: fb.photo_urls,
      videoUrl: fb.video_url || (fb.video_filename ? `/media/${fb.video_filename}` : undefined),
      videoFilename: fb.video_filename || undefined,
      isDraft: false,
    }));

    if (draftPin) {
      list.push({
        id: 'draft-pin',
        pageNumber: draftPin.pageNumber,
        x: draftPin.x,
        y: draftPin.y,
        isDraft: true,
      });
    }

    return list;
  }, [relevantFeedback, draftPin]);

  // Filter pins based on showPins toggle, keeping draft pins visible
  const visiblePins = useMemo(() => {
    return showPins ? pins : pins.filter((p) => p.isDraft);
  }, [pins, showPins]);

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
    <div className="flex-1 min-h-0 flex flex-col relative w-full h-full overflow-hidden bg-background">
      {/* Custom Station Toolbar directly above the PDF component */}
      <div className="shrink-0 bg-muted/30 border-b border-border px-3 py-1.5 flex items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Station Controls</span>
          </span>
          <Badge variant="outline" className="font-mono text-[11px] px-2 py-0.5 h-5 bg-background">
            Page {activePage}
          </Badge>
          {pins.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <Badge
                variant="secondary"
                className={cn(
                  "font-mono text-[10px] px-1.5 py-0 h-5 gap-1 transition-opacity",
                  !showPins && "opacity-50"
                )}
              >
                <MapPin className="w-3 h-3 text-primary" />
                <span>{pins.filter((p) => !p.isDraft).length} pins</span>
              </Badge>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => setShowPins((prev) => !prev)}
                className={cn(
                  "h-5 w-5 p-0 cursor-pointer transition-colors border-border/80",
                  showPins ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground"
                )}
                title={showPins ? "Hide pins on document" : "Show pins on document"}
                aria-label={showPins ? "Hide pins on document" : "Show pins on document"}
              >
                {showPins ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Submit Note Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab('submit');
              setIsNotesOpen(true);
            }}
            className="h-7 px-2.5 gap-1.5 text-xs font-medium cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-primary" />
            <span>Add Note</span>
          </Button>

          {/* Notes / Comments Button */}
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setHighlightedFeedbackId(null);
              setActiveTab('stream');
              setIsNotesOpen(true);
            }}
            className="h-7 px-2.5 gap-1.5 text-xs font-medium cursor-pointer shadow-sm"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Notes</span>
            {noteCount > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px]">
                {noteCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* PDF Component Container */}
      <div className="flex-1 min-h-0 w-full h-full relative overflow-hidden bg-background">
        <PdfiumViewer
          url={document.url}
          onPageChange={setActivePage}
          pins={visiblePins}
          isPlacingPin={isPlacingPin}
          initialPin={draftPin}
          onPinPlaced={(coords) => {
            setDraftPin(coords);
            setIsPlacingPin(false);
            setIsNotesOpen(true);
          }}
          onCancelPlacement={() => {
            setIsPlacingPin(false);
            setIsNotesOpen(true);
          }}
          onOpenDrawer={(pin) => {
            setHighlightedFeedbackId(pin.id);
            setActiveTab('stream');
            setIsNotesOpen(true);
          }}
        />
      </div>

      {/* Notes & Comments Popover / Slide-over Drawer */}
      {isNotesOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop (semi-transparent to keep PDF sharp) */}
          <div
            className="fixed inset-0 bg-black/30 transition-opacity animate-in fade-in-0 duration-200"
            onClick={() => setIsNotesOpen(false)}
          />

          {/* Drawer Container: Fullscreen on mobile, max-width slide-over on landscape/desktop */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Station Notes and Comments"
            className={cn(
              'relative z-50 flex flex-col bg-card border-border shadow-2xl transition-all duration-200 overflow-hidden',
              'inset-0 w-full h-full',
              'md:inset-y-0 md:right-0 md:left-auto md:w-full md:max-w-lg lg:max-w-xl md:border-l md:rounded-l-2xl'
            )}
          >
            {/* Drawer Header */}
            <header className="px-4 py-3 border-b border-border bg-card flex items-center justify-between shrink-0">
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
                  <span>Notes</span>
                  {noteCount > 0 && (
                    <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px]">
                      {noteCount}
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
                  documentId={document?.id}
                  initialPageRef={activePage}
                  draftPin={draftPin}
                  onStartPinPlacement={() => {
                    setShowPins(true);
                    setIsPlacingPin(true);
                    setIsNotesOpen(false);
                  }}
                  onClearDraftPin={() => setDraftPin(null)}
                  onFeedbackSubmitted={() => {
                    setDraftPin(null);
                    loadFeedback();
                    onFeedbackSubmitted?.();
                    setActiveTab('stream');
                  }}
                />
              ) : (
                <FeedbackStream
                  slotId={slotId}
                  documentId={document?.id}
                  highlightedFeedbackId={highlightedFeedbackId}
                  onSelectFeedback={(id) => setHighlightedFeedbackId(id)}
                />
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default SlotViewerVariant;
