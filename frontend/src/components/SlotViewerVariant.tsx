import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { FC } from "react";
import { PdfiumViewer } from "./PdfiumViewer";
import { FeedbackEngine } from "./FeedbackEngine";
import { FeedbackStream } from "./FeedbackStream";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  X,
  MessageSquare,
  PlusCircle,
  AlertCircle,
  FileText,
  MapPin,
  Eye,
  EyeOff,
  PanelRightClose,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentRevision, FeedbackItem, PdfPin } from "../types";
import { fetchSlotFeedback, deleteFeedbackDirect } from "../services/api";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { PhotoLightboxModal } from "./PhotoLightboxModal";

interface SlotViewerVariantProps {
  slotId: number;
  document: DocumentRevision | null;
  totalFeedbackCount?: number;
  isAdmin?: boolean;
  onFeedbackSubmitted?: () => void;
  onReinstateDocument?: (docId: number) => void;
}

export const SlotViewerVariant: FC<SlotViewerVariantProps> = ({
  slotId,
  document,
  totalFeedbackCount = 0,
  isAdmin = false,
  onFeedbackSubmitted,
  onReinstateDocument,
}) => {
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"submit" | "stream">("submit");
  const [activePage, setActivePage] = useState<number>(1);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [hasLoadedFeedback, setHasLoadedFeedback] = useState(false);
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [draftPin, setDraftPin] = useState<{
    pageNumber: number;
    x: number;
    y: number;
  } | null>(null);
  const [showPins, setShowPins] = useState(true);
  const [highlightedFeedbackId, setHighlightedFeedbackId] = useState<
    string | null
  >(null);
  const [editingFeedback, setEditingFeedback] = useState<FeedbackItem | null>(
    null,
  );
  const [targetPage, setTargetPage] = useState<{
    pageNumber: number;
    seq: number;
  } | null>(null);

  const handleSelectFeedback = useCallback(
    (id: string | null, item?: FeedbackItem) => {
      setHighlightedFeedbackId(id);
      if (!id) return;
      const target = item || feedbackList.find((f) => f.id === id);
      if (target && target.page_ref > 0) {
        setTargetPage({ pageNumber: target.page_ref, seq: Date.now() });
      }
    },
    [feedbackList],
  );

  const handleStartEdit = useCallback((item: FeedbackItem) => {
    setEditingFeedback(item);
    if ((item.pin_x ?? 0) > 0 || (item.pin_y ?? 0) > 0) {
      setDraftPin({
        pageNumber: item.page_ref,
        x: item.pin_x ?? 0,
        y: item.pin_y ?? 0,
      });
    } else {
      setDraftPin(null);
    }
    if (item.page_ref > 0) {
      setTargetPage({ pageNumber: item.page_ref, seq: Date.now() });
    }
    setActiveTab("submit");
    setIsNotesOpen(true);
  }, []);

  // Responsive Wide-Screen State (>= 1024px triggers side-by-side dock layout)
  const [isWideScreen, setIsWideScreen] = useState<boolean>(() => {
    return typeof window !== "undefined" ? window.innerWidth >= 1024 : false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth >= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Resizable Dock Width State (default 460px, bounded between 340px and 65% of screen)
  const [dockWidth, setDockWidth] = useState<number>(() => {
    const saved = localStorage.getItem("assembly_dock_width");
    return saved ? Math.max(340, Math.min(850, parseInt(saved, 10))) : 460;
  });
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const startResizing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const startWidth = dockWidth;

      const onMove = (moveEvent: MouseEvent | TouchEvent) => {
        const currentX =
          "touches" in moveEvent
            ? moveEvent.touches[0].clientX
            : moveEvent.clientX;
        const delta = startX - currentX;
        const maxAllowed = Math.min(900, Math.floor(window.innerWidth * 0.65));
        const nextWidth = Math.max(
          340,
          Math.min(maxAllowed, startWidth + delta),
        );
        setDockWidth(nextWidth);
      };

      const onUp = () => {
        setIsResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
        setDockWidth((w) => {
          localStorage.setItem("assembly_dock_width", w.toString());
          return w;
        });
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove);
      window.addEventListener("touchend", onUp);
    },
    [dockWidth],
  );

  // Unified Photo Lightbox State with Back Button Navigation
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  const openPhoto = useCallback((url: string) => {
    window.history.pushState({ modal: "photo", photoUrl: url }, "");
    setActivePhoto(url);
  }, []);

  const handleClosePhoto = useCallback(() => {
    if (activePhoto) {
      if (window.history.state?.modal === "photo") {
        window.history.back();
      } else {
        setActivePhoto(null);
      }
    }
  }, [activePhoto]);

  // Notes drawer history integration (swipe-back closes notes without navigating off document)
  const isNotesInHistoryRef = useRef(false);

  useEffect(() => {
    if (isNotesOpen) {
      if (
        !isNotesInHistoryRef.current &&
        window.history.state?.panel !== "notes"
      ) {
        window.history.pushState(
          { ...window.history.state, panel: "notes" },
          "",
          window.location.href,
        );
        isNotesInHistoryRef.current = true;
      }
    } else {
      isNotesInHistoryRef.current = false;
    }
  }, [isNotesOpen]);

  const handleCloseNotes = useCallback(() => {
    setIsNotesOpen(false);
    if (window.history.state?.panel === "notes") {
      isNotesInHistoryRef.current = false;
      window.history.back();
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (activePhoto) {
        setActivePhoto(null);
        return;
      }
      if (isNotesOpen) {
        isNotesInHistoryRef.current = false;
        setIsNotesOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activePhoto) {
          handleClosePhoto();
        } else if (isNotesOpen) {
          handleCloseNotes();
        }
      }
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePhoto, handleClosePhoto, handleCloseNotes, isNotesOpen]);

  // Cleanup on unmount if notes panel entry was still active in history
  useEffect(() => {
    return () => {
      if (
        isNotesInHistoryRef.current &&
        window.history.state?.panel === "notes"
      ) {
        isNotesInHistoryRef.current = false;
        window.history.back();
      }
    };
  }, []);

  const loadFeedback = useCallback(async () => {
    try {
      const items = await fetchSlotFeedback(slotId, document?.id);
      setFeedbackList(items);
      setHasLoadedFeedback(true);
    } catch (err) {
      console.warn("Could not fetch feedback for slot pins:", err);
    }
  }, [slotId, document?.id]);

  useEffect(() => {
    setHasLoadedFeedback(false);
    loadFeedback();
  }, [loadFeedback]);

  // Note Deletion State
  const [noteToDelete, setNoteToDelete] = useState<FeedbackItem | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState<boolean>(false);

  const handleRequestDelete = useCallback((item: FeedbackItem) => {
    setNoteToDelete(item);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!noteToDelete) return;
    setIsDeletingNote(true);
    try {
      await deleteFeedbackDirect(noteToDelete.id, slotId);
      setFeedbackList((prev) => prev.filter((i) => i.id !== noteToDelete.id));
      if (editingFeedback?.id === noteToDelete.id) {
        setEditingFeedback(null);
        setDraftPin(null);
        setActiveTab("stream");
      }
      setNoteToDelete(null);
      loadFeedback();
      onFeedbackSubmitted?.();
    } catch (err) {
      console.error("Failed to delete note:", err);
      alert("Failed to delete note. Please try again.");
    } finally {
      setIsDeletingNote(false);
    }
  }, [
    noteToDelete,
    slotId,
    editingFeedback,
    loadFeedback,
    onFeedbackSubmitted,
  ]);

  // Notes specifically relevant to this document revision
  const relevantFeedback = useMemo(() => {
    if (!document?.id) return feedbackList;
    return feedbackList.filter(
      (fb) => !fb.document_id || fb.document_id === document.id,
    );
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
    const list: PdfPin[] = relevantFeedback
      .filter((fb) => !editingFeedback || fb.id !== editingFeedback.id)
      .map((fb) => ({
        id: fb.id,
        pageNumber: fb.page_ref,
        x: fb.pin_x ?? 0,
        y: fb.pin_y ?? 0,
        author: fb.author,
        comment: fb.text_comment || undefined,
        sectionRef: fb.section_ref || undefined,
        timestamp: fb.timestamp,
        status: fb.status,
        photoUrls: fb.photo_urls,
        videoUrl:
          fb.video_url ||
          (fb.video_filename ? `/media/${fb.video_filename}` : undefined),
        videoFilename: fb.video_filename || undefined,
        isDraft: false,
      }));

    if (draftPin) {
      list.push({
        id: "draft-pin",
        pageNumber: draftPin.pageNumber,
        x: draftPin.x,
        y: draftPin.y,
        isDraft: true,
      });
    }

    return list;
  }, [relevantFeedback, draftPin, editingFeedback]);

  // Filter pins based on showPins toggle, keeping draft pins visible
  const visiblePins = useMemo(() => {
    return showPins ? pins : pins.filter((p) => p.isDraft);
  }, [pins, showPins]);

  const renderNotesContent = (isDock: boolean) => (
    <div className="flex flex-col h-full w-full overflow-hidden bg-card">
      {/* Header */}
      <header className="px-4 py-3 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Comments
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
          onClick={handleCloseNotes}
          title={isDock ? "Collapse Notes Dock (Esc)" : "Close Notes"}
          className="cursor-pointer text-muted-foreground hover:text-foreground h-8 w-8"
        >
          {isDock ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </Button>
      </header>

      {/* Tab Navigation */}
      <div className="p-3 border-b border-border bg-muted/20 shrink-0">
        <div className="flex bg-muted/60 p-1 rounded-xl border border-border">
          <button
            onClick={() => setActiveTab("submit")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer",
              activeTab === "submit"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{editingFeedback ? "Edit Comment" : "Submit Comment"}</span>
          </button>

          <button
            onClick={() => setActiveTab("stream")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer",
              activeTab === "stream"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments</span>
            {noteCount > 0 && (
              <Badge
                variant="secondary"
                className="px-1.5 py-0 h-4 text-[10px]"
              >
                {noteCount}
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* Drawer / Dock Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-background/50">
        {activeTab === "submit" ? (
          <FeedbackEngine
            slotId={slotId}
            documentId={document?.id}
            initialPageRef={activePage}
            draftPin={draftPin}
            onStartPinPlacement={(currentPin) => {
              const pinToPlace =
                currentPin ||
                draftPin ||
                (editingFeedback
                  ? {
                      pageNumber: editingFeedback.page_ref,
                      x: editingFeedback.pin_x ?? 50,
                      y: editingFeedback.pin_y ?? 50,
                    }
                  : null);
              if (pinToPlace) {
                setDraftPin(pinToPlace);
                setTargetPage({
                  pageNumber: pinToPlace.pageNumber,
                  seq: Date.now(),
                });
              }
              setShowPins(true);
              setIsPlacingPin(true);
              if (!isWideScreen) {
                setIsNotesOpen(false);
              }
            }}
            onClearDraftPin={() => setDraftPin(null)}
            editingFeedback={editingFeedback}
            onCancelEdit={() => {
              setEditingFeedback(null);
              setDraftPin(null);
            }}
            onDeleteNote={handleRequestDelete}
            onFeedbackSubmitted={() => {
              setEditingFeedback(null);
              setDraftPin(null);
              loadFeedback();
              onFeedbackSubmitted?.();
              setActiveTab("stream");
            }}
          />
        ) : (
          <FeedbackStream
            slotId={slotId}
            documentId={document?.id}
            isAdmin={isAdmin}
            highlightedFeedbackId={highlightedFeedbackId}
            onSelectFeedback={handleSelectFeedback}
            onViewPhoto={openPhoto}
            onCommentUpdated={loadFeedback}
            onEditNote={handleStartEdit}
            onNoteDeleted={() => {
              loadFeedback();
              onFeedbackSubmitted?.();
            }}
          />
        )}
      </div>
    </div>
  );

  if (!document) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center bg-background">
        <Card className="max-w-md p-8 text-center border-border shadow-sm">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg text-foreground">
            No Manual Uploaded
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Slot {slotId} does not currently have an active instruction manual
            PDF.
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
          {document && !document.is_live && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge
                variant="secondary"
                className="font-mono text-[10px] px-1.5 py-0 h-5 text-amber-400 bg-amber-500/10 border-amber-500/30"
              >
                Obsolete Revision (v{document.version})
              </Badge>
              {isAdmin && onReinstateDocument && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onReinstateDocument(document.id)}
                  className="h-5 px-2 text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer"
                  title="Reinstate this version as the live document"
                >
                  <RotateCcw className="w-2.5 h-2.5 mr-1" />
                  Reinstate as Live
                </Button>
              )}
            </div>
          )}
          {pins.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <Badge
                variant="secondary"
                className={cn(
                  "font-mono text-[10px] px-1.5 py-0 h-5 gap-1 transition-opacity",
                  !showPins && "opacity-50",
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
                  showPins
                    ? "text-primary hover:text-primary/80"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={
                  showPins ? "Hide pins on document" : "Show pins on document"
                }
                aria-label={
                  showPins ? "Hide pins on document" : "Show pins on document"
                }
              >
                {showPins ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3 text-muted-foreground" />
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Submit Comment Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingFeedback(null);
              setDraftPin(null);
              setActiveTab("submit");
              setIsNotesOpen(true);
            }}
            className="h-7 px-2.5 gap-1.5 text-xs font-medium cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-primary" />
            <span>Add Comment</span>
          </Button>

          {/* Notes / Comments Button */}
          <Button
            variant={isWideScreen && isNotesOpen ? "secondary" : "default"}
            size="sm"
            onClick={() => {
              if (isWideScreen && isNotesOpen) {
                handleCloseNotes();
              } else {
                setHighlightedFeedbackId(null);
                setActiveTab("stream");
                setIsNotesOpen(true);
              }
            }}
            className={cn(
              "h-7 px-2.5 gap-1.5 text-xs font-medium cursor-pointer shadow-sm transition-all",
              isWideScreen && isNotesOpen && "border border-border",
            )}
            title={
              isWideScreen && isNotesOpen
                ? "Collapse comments dock (Esc)"
                : "Open notes"
            }
          >
            {isWideScreen && isNotesOpen ? (
              <PanelRightClose className="w-3.5 h-3.5 text-primary" />
            ) : (
              <MessageSquare className="w-3.5 h-3.5" />
            )}
            <span>Comments</span>
            {noteCount > 0 && (
              <Badge
                variant={isWideScreen && isNotesOpen ? "default" : "secondary"}
                className="px-1.5 py-0 h-4 text-[10px]"
              >
                {noteCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Main Area: Side-by-side flex row on wide screens, pushing PDF to the left */}
      <div className="flex-1 min-h-0 w-full h-full flex flex-row relative overflow-hidden bg-background">
        {/* PDF Component Container - flex-1 min-w-0 */}
        <div className="flex-1 min-w-0 h-full relative overflow-hidden bg-background">
          <PdfiumViewer
            url={document.url}
            onPageChange={setActivePage}
            targetPage={targetPage}
            selectedPinId={highlightedFeedbackId}
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
              setActiveTab("stream");
              setIsNotesOpen(true);
            }}
            onViewPhoto={openPhoto}
            onCommentUpdated={loadFeedback}
            onEditPin={(pin) => {
              const item = feedbackList.find((f) => f.id === pin.id);
              if (item) {
                handleStartEdit(item);
              }
            }}
            onDeletePin={(pin) => {
              const item = feedbackList.find((f) => f.id === pin.id);
              if (item) {
                handleRequestDelete(item);
              }
            }}
          />
        </div>

        {/* Resizable Dock on Wide Screens (>= 1024px) */}
        {isWideScreen && isNotesOpen && (
          <>
            {/* Draggable Resizer Bar */}
            <div
              onMouseDown={startResizing}
              onTouchStart={startResizing}
              className={cn(
                "w-2 hover:w-2.5 shrink-0 cursor-col-resize h-full bg-border/80 hover:bg-primary/50 transition-colors select-none relative group z-20 flex items-center justify-center",
                isResizing && "w-2.5 bg-primary select-none",
              )}
              title="Drag to resize notes dock"
              aria-label="Resize notes dock"
            >
              <div className="w-0.5 h-8 bg-muted-foreground/40 rounded-full group-hover:bg-primary-foreground transition-colors" />
            </div>

            {/* Docked Notes Panel Container */}
            <aside
              style={{ width: `${dockWidth}px` }}
              className="shrink-0 h-full bg-card border-l border-border flex flex-col shadow-lg z-10 overflow-hidden"
              role="region"
              aria-label="Comments Dock"
            >
              {renderNotesContent(true)}
            </aside>
          </>
        )}
      </div>

      {/* Slide-over Drawer on Mobile / Narrow Screens (< 1024px) - kept mounted so form state is preserved during pin placement */}
      {!isWideScreen && (
        <div
          className={cn(
            "fixed inset-0 z-50 flex justify-end transition-all duration-200",
            !isNotesOpen && "pointer-events-none opacity-0 invisible",
          )}
        >
          {/* Backdrop */}
          <div
            className={cn(
              "fixed inset-0 bg-black/40 transition-opacity duration-200",
              !isNotesOpen ? "opacity-0 pointer-events-none" : "opacity-100",
            )}
            onClick={handleCloseNotes}
          />

          {/* Drawer Container */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Comments"
            className={cn(
              "relative z-50 flex flex-col bg-card border-border shadow-2xl transition-transform duration-200 overflow-hidden inset-0 w-full h-full md:inset-y-0 md:right-0 md:left-auto md:w-full md:max-w-lg md:border-l md:rounded-l-2xl",
              !isNotesOpen && "translate-x-full",
            )}
          >
            {renderNotesContent(false)}
          </aside>
        </div>
      )}

      {/* Invisible global mouse tracking overlay while dragging resizer */}
      {isResizing && (
        <div className="fixed inset-0 z-[100] cursor-col-resize select-none pointer-events-auto bg-transparent" />
      )}

      {/* Unified Zoomable Photo Lightbox Modal */}
      <PhotoLightboxModal photoUrl={activePhoto} onClose={handleClosePhoto} />

      {/* Delete Confirmation Warning Dialog */}
      <DeleteNoteDialog
        open={noteToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setNoteToDelete(null);
        }}
        note={noteToDelete}
        onConfirmDelete={handleConfirmDelete}
        isDeleting={isDeletingNote}
      />
    </div>
  );
};

export default SlotViewerVariant;
