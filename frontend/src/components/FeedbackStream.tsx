import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { MessageSquare, Clock, User, Download, Play, RefreshCw, X } from 'lucide-react';
import type { FeedbackItem } from '../types';
import { fetchSlotFeedback } from '../services/api';
import { isMediaCached, getMediaBlob, saveMediaBlob } from '../services/db';

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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 md:p-5 shadow-sm flex flex-col h-[75vh] md:h-[82vh]">
      {/* Header & Filters */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-zinc-400" />
          <h3 className="font-semibold text-zinc-100 text-sm md:text-base">
            Station Notes
          </h3>
          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md border border-zinc-700">
            {feedbackList.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-zinc-950 rounded-md p-0.5 text-xs border border-zinc-800">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                filter === 'all' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('open')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                filter === 'open' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Open
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                filter === 'resolved' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Resolved
            </button>
          </div>

          <button
            onClick={loadFeedback}
            title="Refresh comments"
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto space-y-3 pt-3 pr-1">
        {filteredItems.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-zinc-500 text-xs md:text-sm">
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
                className="bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 rounded-md p-3.5 transition-all text-xs md:text-sm"
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      {item.author}
                    </span>
                    <span className="bg-zinc-800 text-zinc-300 font-mono px-1.5 py-0.5 rounded text-[11px] border border-zinc-700">
                      {item.station_id}
                    </span>
                    <span className="bg-zinc-850 text-zinc-300 font-mono px-1.5 py-0.5 rounded text-[11px] border border-zinc-700 font-medium">
                      Page {item.page_ref}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-mono font-medium px-1.5 py-0.5 rounded border ${
                        item.status === 'resolved'
                          ? 'bg-zinc-800 text-emerald-400 border-zinc-700'
                          : item.status === 'reviewed'
                          ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                          : 'bg-zinc-850 text-amber-400 border-zinc-700'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>

                {/* Text comment */}
                {item.text_comment && (
                  <p className="text-zinc-300 whitespace-pre-line leading-relaxed mb-2.5">
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
                        className="relative w-14 h-14 rounded-md overflow-hidden border border-zinc-700 hover:border-zinc-500 transition-colors cursor-pointer group"
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
                  <div className="mt-2 p-2.5 bg-zinc-900 border border-zinc-800 rounded-md">
                    {vState.isLoaded && vState.videoSrc ? (
                      <div>
                        <video
                          controls
                          src={vState.videoSrc}
                          className="w-full rounded-md bg-black max-h-56"
                        />
                        <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                          <span>{item.video_filename}</span>
                          {vState.isCached && (
                            <span className="text-emerald-400 font-medium">Cached Offline</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Play className="w-4 h-4 text-zinc-400" />
                          <div>
                            <div className="font-medium text-zinc-200 text-xs">
                              Video Recording
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              {vState.isCached ? 'Available in local storage' : 'On-demand download'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handlePlayVideo(item)}
                            className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 active:bg-zinc-300 text-zinc-900 rounded-md text-xs font-medium transition-colors cursor-pointer"
                          >
                            Play Video
                          </button>

                          {!vState.isCached && (
                            <button
                              onClick={() => handleSaveVideoOffline(item)}
                              disabled={vState.isDownloading}
                              title="Cache video locally for offline viewing"
                              className="p-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <Download className={`w-3.5 h-3.5 ${vState.isDownloading ? 'animate-bounce' : ''}`} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Timestamp */}
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-2 font-mono">
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
          <button
            onClick={() => setActivePhoto(null)}
            className="absolute top-4 right-4 bg-zinc-800 hover:bg-zinc-700 p-2 rounded-md text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={activePhoto}
            alt="Fullscreen preview"
            className="max-w-full max-h-[90vh] rounded-md shadow-2xl object-contain border border-zinc-800"
          />
        </div>
      )}
    </div>
  );
};
