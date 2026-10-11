import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { MessageSquare, Clock, User, Download, Play, RefreshCw, X } from 'lucide-react';
import type { FeedbackItem } from '../types';
import { fetchSlotFeedback } from '../services/api';
import { isMediaCached, getMediaBlob, saveMediaBlob } from '../services/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FeedbackStreamProps {
  slotId: number;
}

export const FeedbackStream: FC<FeedbackStreamProps> = ({ slotId }) => {
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  // Video state per item: item.id -> { isLoaded: boolean; videoSrc?: string; isCached: boolean; isDownloading: boolean }
  const [videoStates, setVideoStates] = useState<
    Record<string, { isLoaded: boolean; videoSrc?: string; isCached: boolean; isDownloading: boolean }>
  >({});

  // Lightbox state for photos
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  const loadFeedback = async () => {
    setIsLoading(true);
    try {
      const items = await fetchSlotFeedback(slotId);
      setFeedbackList(items);

      // Check cache status for any videos
      const initialStates: Record<string, any> = {};
      for (const item of items) {
        if (item.video_filename) {
          const cached = await isMediaCached(item.video_filename);
          initialStates[item.id] = {
            isLoaded: false,
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
  }, [slotId]);

  // Load video on-demand (from IndexedDB cache if available, or fetch from server)
  const handlePlayVideo = async (item: FeedbackItem) => {
    if (!item.video_filename) return;

    // Check if already cached in IndexedDB
    const cachedBlob = await getMediaBlob(item.video_filename);
    if (cachedBlob) {
      const blobUrl = URL.createObjectURL(cachedBlob);
      setVideoStates((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          isLoaded: true,
          videoSrc: blobUrl,
          isCached: true,
          isDownloading: false,
        },
      }));
      return;
    }

    // Otherwise stream from server
    const videoUrl = item.video_url || `/media/${item.video_filename}`;
    setVideoStates((prev) => ({
      ...prev,
      [item.id]: {
        ...prev[item.id],
        isLoaded: true,
        videoSrc: videoUrl,
        isDownloading: false,
      },
    }));
  };

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

            return (
              <div
                key={item.id}
                className="bg-muted/20 border border-border hover:border-border/80 rounded-xl p-3.5 transition-all text-xs md:text-sm"
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
                        onClick={() => setActivePhoto(url)}
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

                {/* On-Demand Video Player / Placeholder */}
                {item.video_filename && (
                  <div className="mt-2 p-2.5 bg-background border border-border rounded-lg">
                    {vState.isLoaded && vState.videoSrc ? (
                      <div>
                        <video
                          controls
                          src={vState.videoSrc}
                          className="w-full rounded-md bg-black max-h-56"
                        />
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                          <span>{item.video_filename}</span>
                          {vState.isCached && (
                            <span className="text-emerald-400 font-medium">Cached Offline</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Play className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-foreground text-xs">
                              Video Recording
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {vState.isCached ? 'Available in local storage' : 'On-demand download'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            size="xs"
                            onClick={() => handlePlayVideo(item)}
                          >
                            Play Video
                          </Button>

                          {!vState.isCached && (
                            <Button
                              variant="outline"
                              size="icon-xs"
                              onClick={() => handleSaveVideoOffline(item)}
                              disabled={vState.isDownloading}
                              title="Cache video locally for offline viewing"
                            >
                              <Download className={`w-3.5 h-3.5 ${vState.isDownloading ? 'animate-bounce' : ''}`} />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
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
