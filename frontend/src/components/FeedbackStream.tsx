import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { FC } from 'react';
import { MessageSquare, Clock, User, Download, RefreshCw, Pencil, Trash2, Check } from 'lucide-react';
import type { FeedbackItem } from '../types';
import { fetchSlotFeedback, updateFeedbackComment, deleteFeedbackDirect, updateFeedbackStatus } from '../services/api';
import { isMediaCached, getMediaBlob, saveMediaBlob } from '../services/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatNoteDateTime } from '@/lib/utils';
import { DeleteNoteDialog } from './DeleteNoteDialog';
import { PhotoLightboxModal } from './PhotoLightboxModal';

interface FeedbackStreamProps {
  slotId: number;
  documentId?: number;
  isAdmin?: boolean;
  highlightedFeedbackId?: string | null;
  onSelectFeedback?: (feedbackId: string | null, item?: FeedbackItem) => void;
  onCommentUpdated?: (feedbackId: string, newComment: string) => void;
  onViewPhoto?: (url: string) => void;
  onEditNote?: (item: FeedbackItem) => void;
  onNoteDeleted?: (feedbackId: string) => void;
}

export const FeedbackStream: FC<FeedbackStreamProps> = ({
  slotId,
  documentId,
  isAdmin = false,
  highlightedFeedbackId,
  onSelectFeedback,
  onCommentUpdated,
  onViewPhoto,
  onEditNote,
  onNoteDeleted,
}) => {
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(highlightedFeedbackId ?? null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Inline comment edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Note deletion state
  const [noteToDelete, setNoteToDelete] = useState<FeedbackItem | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);

  const handleConfirmDelete = async () => {
    if (!noteToDelete) return;
    setIsDeletingNote(true);
    try {
      await deleteFeedbackDirect(noteToDelete.id, slotId);
      setFeedbackList((prev) => prev.filter((i) => i.id !== noteToDelete.id));
      onNoteDeleted?.(noteToDelete.id);
      setNoteToDelete(null);
    } catch (err) {
      console.error('Failed to delete note:', err);
      alert('Failed to delete note. Please try again.');
    } finally {
      setIsDeletingNote(false);
    }
  };

  const handleStatusChange = async (
    item: FeedbackItem,
    newStatus: 'open' | 'reviewed' | 'resolved'
  ) => {
    // Optimistic UI update
    setFeedbackList((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
    );
    try {
      await updateFeedbackStatus(item.id, newStatus);
      onCommentUpdated?.(item.id, item.text_comment || '');
    } catch (err) {
      console.error('Failed to update note status:', err);
      // Revert if API call fails
      loadFeedback();
    }
  };

  // Synchronize internal selection when highlightedFeedbackId prop changes
  useEffect(() => {
    if (highlightedFeedbackId !== undefined) {
      setSelectedId(highlightedFeedbackId);
    }
  }, [highlightedFeedbackId]);

  // Auto-scroll to highlighted feedback item when requested externally
  useEffect(() => {
    if (highlightedFeedbackId && itemRefs.current[highlightedFeedbackId]) {
      const timer = setTimeout(() => {
        itemRefs.current[highlightedFeedbackId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedFeedbackId, feedbackList]);

  const handleCardClick = (item: FeedbackItem) => {
    setSelectedId(item.id);
    onSelectFeedback?.(item.id, item);
  };

  // Video state per item: item.id -> { isLoaded: boolean; videoSrc?: string; isCached: boolean; isDownloading: boolean }
  const [videoStates, setVideoStates] = useState<
    Record<string, { isLoaded: boolean; videoSrc?: string; isCached: boolean; isDownloading: boolean }>
  >({});

  // Lightbox state for photos
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  const startEditing = (item: FeedbackItem) => {
    setEditingId(item.id);
    setEditText(item.text_comment || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleSaveEdit = async (feedbackId: string) => {
    setIsSavingEdit(true);
    try {
      await updateFeedbackComment(feedbackId, editText, slotId);
      setFeedbackList((prev) =>
        prev.map((i) => (i.id === feedbackId ? { ...i, text_comment: editText } : i))
      );
      onCommentUpdated?.(feedbackId, editText);
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update comment:', err);
      alert('Failed to save comment edit');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openPhoto = (url: string) => {
    if (onViewPhoto) {
      onViewPhoto(url);
      return;
    }
    window.history.pushState({ modal: 'photo', photoUrl: url }, '');
    setActivePhoto(url);
  };

  const handleClosePhoto = useCallback(() => {
    if (activePhoto) {
      if (window.history.state?.modal === 'photo') {
        window.history.back();
      } else {
        setActivePhoto(null);
      }
    }
  }, [activePhoto]);

  useEffect(() => {
    const handlePopState = () => {
      if (activePhoto) {
        setActivePhoto(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activePhoto) {
        handleClosePhoto();
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePhoto, handleClosePhoto]);

  const loadFeedback = async () => {
    setIsLoading(true);
    try {
      const items = await fetchSlotFeedback(slotId, documentId);
      setFeedbackList(items);

      // Check cache status and resolve video source for all items with video
      const initialStates: Record<string, any> = {};
      for (const item of items) {
        if (item.video_filename || item.video_url) {
          let cached = false;
          let blobUrl: string | undefined;
          if (item.video_filename) {
            cached = await isMediaCached(item.video_filename);
            if (cached) {
              const blob = await getMediaBlob(item.video_filename);
              if (blob) {
                blobUrl = URL.createObjectURL(blob);
              }
            }
          }
          const defaultSrc =
            blobUrl ||
            item.video_url ||
            (item.video_filename ? `/media/${item.video_filename}` : undefined);
          initialStates[item.id] = {
            isLoaded: true,
            videoSrc: defaultSrc,
            isCached: cached,
            isDownloading: false,
          };
        }
      }
      setVideoStates(initialStates);
    } catch (err) {
      console.warn('Failed to fetch slot feedback (may be offline):', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFeedback();
  }, [slotId, documentId]);


  // Download video into IndexedDB cache for offline replay
  const handleSaveVideoOffline = async (item: FeedbackItem) => {
    if (!item.video_filename) return;

    setVideoStates((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], isDownloading: true },
    }));

    try {
      const videoUrl = item.video_url || `/media/${item.video_filename}`;
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error('Video download failed');
      const blob = await res.blob();
      await saveMediaBlob(item.video_filename, blob);

      const blobUrl = URL.createObjectURL(blob);
      setVideoStates((prev) => ({
        ...prev,
        [item.id]: {
          isLoaded: true,
          videoSrc: blobUrl,
          isCached: true,
          isDownloading: false,
        },
      }));
    } catch (err) {
      console.error('Failed to download video offline:', err);
      setVideoStates((prev) => ({
        ...prev,
        [item.id]: { ...prev[item.id], isDownloading: false },
      }));
    }
  };

  const filteredItems = useMemo(() => {
    return feedbackList
      .filter((item) => {
        if (filter === 'all') return true;
        if (filter === 'open') return item.status === 'open';
        if (filter === 'resolved') return item.status === 'resolved';
        return true;
      })
      .sort((a, b) => {
        // 1. Sort by page_ref ascending (Page 1, Page 2, Page 3...)
        const pageA = a.page_ref > 0 ? a.page_ref : 999999;
        const pageB = b.page_ref > 0 ? b.page_ref : 999999;
        if (pageA !== pageB) {
          return pageA - pageB;
        }

        // 2. Sort by pin_y ascending (top of the page first, lower down after)
        const yA = typeof a.pin_y === 'number' && a.pin_y >= 0 ? a.pin_y : 0;
        const yB = typeof b.pin_y === 'number' && b.pin_y >= 0 ? b.pin_y : 0;
        if (yA !== yB) {
          return yA - yB;
        }

        // 3. Sort by pin_x ascending (left to right, natural reading order)
        const xA = typeof a.pin_x === 'number' && a.pin_x >= 0 ? a.pin_x : 0;
        const xB = typeof b.pin_x === 'number' && b.pin_x >= 0 ? b.pin_x : 0;
        if (xA !== xB) {
          return xA - xB;
        }

        // 4. Stable tie-breaker: timestamp ascending
        return (a.timestamp || '').localeCompare(b.timestamp || '');
      });
  }, [feedbackList, filter]);

  return (
    <Card className="p-4 md:p-5 flex flex-col h-full min-h-0 shadow-sm">
      {/* Header & Filters */}
      <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-card-foreground text-sm md:text-base">
            Station Notes
          </h3>
          <Badge variant="secondary" className="text-xs">
            {feedbackList.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-muted/60 rounded-lg p-0.5 text-xs border border-border">
            {(['all', 'open', 'resolved'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  'px-2 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer',
                  filter === tab
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={loadFeedback}
            title="Refresh comments"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto space-y-3 pt-3 pr-1">
        {filteredItems.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-xs md:text-sm">
            <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
            <p>No notes recorded for this manual yet.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const vState = videoStates[item.id] || {
              isLoaded: false,
              isCached: false,
              isDownloading: false,
            };

            const isSelected = item.id === selectedId;

            return (
              <div
                key={item.id}
                ref={(el) => {
                  itemRefs.current[item.id] = el;
                }}
                onClick={() => handleCardClick(item)}
                title={item.page_ref > 0 ? `Jump to Page ${item.page_ref} in PDF` : undefined}
                className={cn(
                  "border rounded-xl p-3.5 transition-all text-xs md:text-sm cursor-pointer",
                  isSelected
                    ? "bg-primary/5 border-primary ring-2 ring-primary/40 shadow-sm"
                    : "bg-muted/20 border-border hover:border-border/80 hover:bg-muted/30"
                )}
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      {item.author}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      Page {item.page_ref}
                    </Badge>
                    {item.section_ref && (
                      <Badge variant="outline" className="font-mono text-[11px] border-primary/40 text-primary">
                        Sec {item.section_ref}
                      </Badge>
                    )}
                    {item.timestamp && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                        <Clock className="w-3 h-3 text-muted-foreground/70" />
                        <span>{formatNoteDateTime(item.timestamp)}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isAdmin ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={item.status}
                          onValueChange={(val) => {
                            if (val) {
                              handleStatusChange(
                                item,
                                val as 'open' | 'reviewed' | 'resolved'
                              );
                            }
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className={cn(
                              "h-6 px-2 text-[10px] uppercase font-mono font-semibold tracking-wider rounded-md border cursor-pointer",
                              item.status === 'resolved' &&
                                "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                              item.status === 'reviewed' &&
                                "bg-blue-500/10 text-blue-400 border-blue-500/30",
                              item.status === 'open' &&
                                "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            )}
                            title="Change status"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="end" className="text-xs">
                            <SelectItem value="open">
                              <span className="flex items-center gap-1.5 text-amber-400 font-mono text-xs">
                                <span className="w-2 h-2 rounded-full bg-amber-400" />
                                Open
                              </span>
                            </SelectItem>
                            <SelectItem value="reviewed">
                              <span className="flex items-center gap-1.5 text-blue-400 font-mono text-xs">
                                <span className="w-2 h-2 rounded-full bg-blue-400" />
                                Reviewed
                              </span>
                            </SelectItem>
                            <SelectItem value="resolved">
                              <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                Resolved
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <Badge
                        variant={
                          item.status === 'resolved'
                            ? 'default'
                            : item.status === 'reviewed'
                            ? 'secondary'
                            : 'outline'
                        }
                        className="text-[10px] uppercase tracking-wider font-mono font-medium"
                      >
                        {item.status}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onEditNote) {
                          onEditNote(item);
                        } else {
                          startEditing(item);
                        }
                      }}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Edit note"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNoteToDelete(item);
                      }}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Text comment or inline edit form */}
                {editingId === item.id ? (
                  <div className="mb-2.5 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full text-xs font-normal border border-input rounded-md p-2 bg-background text-foreground focus:ring-1 focus:ring-ring focus:outline-none resize-y min-h-[70px]"
                      placeholder="Write a comment..."
                      rows={3}
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={cancelEditing}
                        disabled={isSavingEdit}
                        className="h-6 px-2 text-xs cursor-pointer"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="xs"
                        onClick={() => handleSaveEdit(item.id)}
                        disabled={isSavingEdit}
                        className="h-6 px-2.5 text-xs gap-1 cursor-pointer font-medium"
                      >
                        {isSavingEdit ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        <span>Save</span>
                      </Button>
                    </div>
                  </div>
                ) : item.text_comment ? (
                  <p className="text-foreground/90 whitespace-pre-line leading-relaxed mb-2.5 text-xs">
                    {item.text_comment}
                  </p>
                ) : (
                  <p className="text-muted-foreground/60 italic mb-2 text-[11px]">
                    No written comment
                  </p>
                )}

                {/* Photos Gallery */}
                {item.photo_urls && item.photo_urls.length > 0 && (
                  <div className="flex flex-wrap gap-2.5 mb-2.5">
                    {item.photo_urls.map((url, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPhoto(url);
                        }}
                        className="relative group rounded-lg overflow-hidden border border-border hover:border-primary transition-all cursor-pointer bg-muted/20 max-h-44 max-w-[260px]"
                        title="Click to enlarge photo"
                      >
                        <img
                          src={url}
                          alt="Feedback photo"
                          className="max-h-40 w-auto object-contain rounded-md group-hover:scale-102 transition-transform"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Video Player if present in note */}
                {(item.video_filename || item.video_url) && (
                  <div
                    className="mt-2 p-2.5 bg-background border border-border rounded-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={
                        vState.videoSrc ||
                        item.video_url ||
                        (item.video_filename ? `/media/${item.video_filename}` : undefined)
                      }
                      className="w-full rounded-md bg-black max-h-56 object-contain"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                      <span className="truncate max-w-[200px]">{item.video_filename || 'Video note'}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {vState.isCached ? (
                          <span className="text-emerald-400 font-medium text-[10px]">Cached Offline</span>
                        ) : item.video_filename ? (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveVideoOffline(item);
                            }}
                            disabled={vState.isDownloading}
                            className="h-5 px-1.5 text-[10px] gap-1 cursor-pointer"
                            title="Cache video locally for offline viewing"
                          >
                            <Download className={`w-3 h-3 ${vState.isDownloading ? 'animate-bounce' : ''}`} />
                            <span>Cache Offline</span>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Lightbox Modal */}
      <PhotoLightboxModal
        photoUrl={activePhoto}
        onClose={handleClosePhoto}
      />

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
    </Card>
  );
};
