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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 shadow-lg flex flex-col h-[75vh] md:h-[82vh]">
      {/* Header & Filters */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <h3 className="font-bold text-slate-100 text-sm md:text-base">
            Notes & Feedback
          </h3>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
            {feedbackList.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800 rounded-lg p-0.5 text-xs border border-slate-750">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded-md transition-colors ${
                filter === 'all' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('open')}
              className={`px-2 py-1 rounded-md transition-colors ${
                filter === 'open' ? 'bg-amber-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Open
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-2 py-1 rounded-md transition-colors ${
                filter === 'resolved' ? 'bg-emerald-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Resolved
            </button>
          </div>

          <button
            onClick={loadFeedback}
            title="Refresh comments"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feed List */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pt-3 pr-1">
        {filteredItems.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-slate-500 text-xs md:text-sm">
            <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
            <p>No feedback recorded for this manual yet.</p>
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
                className="bg-slate-850 border border-slate-800 hover:border-slate-750 rounded-xl p-3.5 transition-all text-xs md:text-sm"
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-200 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {item.author}
                    </span>
                    <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[11px] border border-slate-700">
                      {item.station_id}
                    </span>
                    <span className="bg-blue-950/70 text-blue-300 px-1.5 py-0.5 rounded text-[11px] border border-blue-800/80 font-medium">
                      Page {item.page_ref}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${
                        item.status === 'resolved'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                          : item.status === 'reviewed'
                          ? 'bg-sky-950/80 text-sky-300 border-sky-800'
                          : 'bg-amber-950/80 text-amber-300 border-amber-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>

                {/* Text comment */}
                {item.text_comment && (
                  <p className="text-slate-300 whitespace-pre-line leading-relaxed mb-2.5">
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
                        className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-700 hover:border-blue-400 transition-colors cursor-pointer group"
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
                  <div className="mt-2 p-2.5 bg-slate-900 border border-slate-800 rounded-lg">
                    {vState.isLoaded && vState.videoSrc ? (
                      <div>
                        <video
                          controls
                          src={vState.videoSrc}
                          className="w-full rounded bg-black max-h-56"
                        />
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                          <span>{item.video_filename}</span>
                          {vState.isCached && (
                            <span className="text-emerald-400 font-medium">Cached Offline</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Play className="w-4 h-4 text-emerald-400" />
                          <div>
                            <div className="font-medium text-slate-200 text-xs">
                              Video Recording
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {vState.isCached ? 'Saved in local storage' : 'On-demand stream'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handlePlayVideo(item)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded text-xs font-medium transition-colors cursor-pointer"
                          >
                            Play Video
                          </button>

                          {!vState.isCached && (
                            <button
                              onClick={() => handleSaveVideoOffline(item)}
                              disabled={vState.isDownloading}
                              title="Cache video locally for offline viewing"
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
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
                <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-2">
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
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
        >
          <button
            onClick={() => setActivePhoto(null)}
            className="absolute top-4 right-4 bg-slate-800 p-2 rounded-full text-white hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={activePhoto}
            alt="Fullscreen preview"
            className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
