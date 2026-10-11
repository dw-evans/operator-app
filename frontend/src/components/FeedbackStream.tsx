import { useState, useEffect, useRef } from 'react';
import type { FC } from 'react';
import { MessageSquare, Clock, User, Download, RefreshCw, X, MapPin } from 'lucide-react';
import type { FeedbackItem } from '../types';
import { fetchSlotFeedback } from '../services/api';
import { isMediaCached, getMediaBlob, saveMediaBlob } from '../services/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FeedbackStreamProps {
  slotId: number;
  documentId?: number;
  highlightedFeedbackId?: string | null;
  onSelectFeedback?: (feedbackId: string | null) => void;
}

export const FeedbackStream: FC<FeedbackStreamProps> = ({
  slotId,
  documentId,
  highlightedFeedbackId,
  onSelectFeedback,
}) => {
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(highlightedFeedbackId ?? null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const handleCardClick = (itemId: string) => {
    const nextId = selectedId === itemId ? null : itemId;
    setSelectedId(nextId);
    onSelectFeedback?.(nextId);
  };

  // Video state per item: item.id -> { isLoaded: boolean; videoSrc?: string; isCached: boolean; isDownloading: boolean }
  const [videoStates, setVideoStates] = useState<
    Record<string, { isLoaded: boolean; videoSrc?: string; isCached: boolean; isDownloading: boolean }>
  >({});

  // Lightbox state for photos
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

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

  const filteredItems = feedbackList.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'open') return item.status === 'open';
    if (filter === 'resolved') return item.status === 'resolved';
    return true;
  });

  return (
    <Card className="p-4 md:p-5 flex flex-col h-[75vh] md:h-[82vh] shadow-sm">
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
                onClick={() => handleCardClick(item.id)}
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
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {item.station_id}
                    </Badge>
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      Page {item.page_ref}
                    </Badge>
                    {item.section_ref && (
                      <Badge variant="outline" className="font-mono text-[11px] border-primary/40 text-primary">
                        Sec {item.section_ref}
                      </Badge>
                    )}
                    {((item.pin_x ?? 0) > 0 || (item.pin_y ?? 0) > 0) && (
                      <Badge variant="outline" className="font-mono text-[10px] gap-1 text-primary border-primary/30">
                        <MapPin className="w-2.5 h-2.5" />
                        <span>{item.pin_x}%, {item.pin_y}%</span>
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
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
                  </div>
                </div>

                {/* Text comment */}
                {item.text_comment && (
                  <p className="text-foreground/90 whitespace-pre-line leading-relaxed mb-2.5">
                    {item.text_comment}
                  </p>
                )}

                {/* Photos Gallery */}
                {item.photo_urls && item.photo_urls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2.5">
                    {item.photo_urls.map((url, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePhoto(url);
                        }}
                        className="relative w-14 h-14 rounded-lg overflow-hidden border border-border hover:border-ring transition-colors cursor-pointer group"
                      >
                        <img
                          src={url}
                          alt="Feedback photo"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
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

                {/* Timestamp */}
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-2 font-mono">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(item.timestamp).toLocaleString()}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Lightbox Modal */}
      {activePhoto && (
        <div
          onClick={() => setActivePhoto(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <Button
            variant="outline"
            size="icon"
            onClick={() => setActivePhoto(null)}
            className="absolute top-4 right-4"
          >
            <X className="w-5 h-5" />
          </Button>
          <img
            src={activePhoto}
            alt="Fullscreen preview"
            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain border border-border"
          />
        </div>
      )}
    </Card>
  );
};
