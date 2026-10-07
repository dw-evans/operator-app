import { useState, useRef, useEffect } from 'react';
import type { FC, FormEvent, ChangeEvent } from 'react';
import { Camera, Video, Send, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { enqueueFeedback } from '../services/db';
import { submitFeedbackDirect } from '../services/api';
import { syncManager } from '../services/sync';
import type { QueuedFeedback } from '../types';

interface FeedbackEngineProps {
  slotId: number;
  onFeedbackSubmitted: () => void;
}

export const FeedbackEngine: FC<FeedbackEngineProps> = ({
  slotId,
  onFeedbackSubmitted,
}) => {
  const [stationId, setStationId] = useState(
    () => localStorage.getItem('assembly_station_id') || 'Station 1'
  );
  const [author, setAuthor] = useState(
    () => localStorage.getItem('assembly_author') || ''
  );
  const [pageRef, setPageRef] = useState<number>(1);
  const [textComment, setTextComment] = useState('');

  // Media state
  const [selectedPhotos, setSelectedPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{
    file: File;
    preview: string;
    duration?: number;
  } | null>(null);

  // Warnings & status
  const [videoWarning, setVideoWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ text: string; type: 'success' | 'queued' | 'error' } | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Persist station and author in localStorage
  useEffect(() => {
    localStorage.setItem('assembly_station_id', stationId);
  }, [stationId]);

  useEffect(() => {
    localStorage.setItem('assembly_author', author);
  }, [author]);

  // Handle Photo selection
  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newItems = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setSelectedPhotos((prev) => [...prev, ...newItems]);
    // Reset input
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Handle Video selection and duration/size verification
  const handleVideoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const previewUrl = URL.createObjectURL(file);

    let warning: string | null = null;
    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > 100) {
      warning = `Warning: Video is large (${sizeInMB.toFixed(1)} MB > 100 MB limit advisory). Uploading may take longer over Wi-Fi.`;
    }

    // Inspect video duration via temporary element
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = previewUrl;
    tempVideo.onloadedmetadata = () => {
      const duration = tempVideo.duration;
      if (duration > 120) {
        warning = warning
          ? `${warning} Also duration is ${Math.round(duration)}s (exceeds 120s advisory).`
          : `Warning: Video duration is ${Math.round(duration)}s (exceeds 120s advisory). Please keep clips concise.`;
      }
      setSelectedVideo({ file, preview: previewUrl, duration });
      setVideoWarning(warning);
    };

    tempVideo.onerror = () => {
      setSelectedVideo({ file, preview: previewUrl });
      setVideoWarning(warning);
    };

    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const removeVideo = () => {
    if (selectedVideo) {
      URL.revokeObjectURL(selectedVideo.preview);
    }
    setSelectedVideo(null);
    setVideoWarning(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!author.trim()) {
      alert('Please enter your name or operator ID.');
      return;
    }
    if (!textComment.trim() && selectedPhotos.length === 0 && !selectedVideo) {
      alert('Please enter a comment or attach a photo/video.');
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    const feedbackId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `fb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const isOnline = navigator.onLine;

    if (isOnline) {
      try {
        const formData = new FormData();
        formData.append('id', feedbackId);
        formData.append('station_id', stationId);
        formData.append('slot_id', slotId.toString());
        formData.append('page_ref', pageRef.toString());
        formData.append('author', author);
        if (textComment.trim()) {
          formData.append('text_comment', textComment.trim());
        }
        if (selectedVideo) {
          formData.append('video', selectedVideo.file, selectedVideo.file.name);
        }
        for (const photo of selectedPhotos) {
          formData.append('photos', photo.file, photo.file.name);
        }

        await submitFeedbackDirect(formData);
        setSubmitMessage({
          text: 'Feedback submitted successfully!',
          type: 'success',
        });
        resetForm();
        onFeedbackSubmitted();
        return;
      } catch (err) {
        console.warn('Direct upload failed, falling back to offline queue:', err);
      }
    }

    // Offline queue fallback
    try {
      const queuedItem: QueuedFeedback = {
        id: feedbackId,
        station_id: stationId,
        slot_id: slotId,
        page_ref: pageRef,
        author: author,
        text_comment: textComment.trim() || undefined,
        videoBlob: selectedVideo?.file,
        videoName: selectedVideo?.file.name,
        photoBlobs: selectedPhotos.map((p) => ({
          blob: p.file,
          name: p.file.name,
        })),
        timestamp: new Date().toISOString(),
        status: 'pending',
      };

      await enqueueFeedback(queuedItem);
      await syncManager.refreshCount();

      setSubmitMessage({
        text: 'Saved offline! Queued for auto-sync once connected.',
        type: 'queued',
      });
      resetForm();
      onFeedbackSubmitted();
    } catch (queueErr) {
      console.error('Failed to queue feedback in IndexedDB:', queueErr);
      setSubmitMessage({
        text: 'Failed to record feedback. Please check tablet storage.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTextComment('');
    setSelectedPhotos([]);
    removeVideo();
    setIsSubmitting(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 shadow-lg flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <h3 className="font-bold text-slate-100 text-sm md:text-base flex items-center gap-2">
            <span>Submit Feedback</span>
            <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Slot {slotId}
            </span>
          </h3>
          <div className="text-xs text-slate-400">
            Air-gapped sync enabled
          </div>
        </div>

        {submitMessage && (
          <div
            className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-xs md:text-sm font-medium border ${
              submitMessage.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
                : submitMessage.type === 'queued'
                ? 'bg-amber-950/70 border-amber-800 text-amber-300'
                : 'bg-rose-950/70 border-rose-800 text-rose-300'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{submitMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Metadata Row: Station, Author, Page Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Station
              </label>
              <input
                type="text"
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                placeholder="Station 1"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Operator Name / ID *
              </label>
              <input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Page Reference *
              </label>
              <input
                type="number"
                min="1"
                required
                value={pageRef}
                onChange={(e) => setPageRef(parseInt(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Comment Textarea */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Feedback Notes / Issue Description
            </label>
            <textarea
              rows={3}
              value={textComment}
              onChange={(e) => setTextComment(e.target.value)}
              placeholder="Describe assembly issue, missing step, torque spec, or part discrepancy..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Media Capture Controls */}
          <div>
            <div className="flex items-center gap-2">
              {/* Photo Input (Camera capture) */}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
                id="photo-upload"
              />
              <label
                htmlFor="photo-upload"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer transition-colors active:scale-95"
              >
                <Camera className="w-4 h-4 text-sky-400" />
                <span>Take / Add Photo</span>
              </label>

              {/* Video Input (Camera capture) */}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                onChange={handleVideoSelect}
                className="hidden"
                id="video-upload"
              />
              <label
                htmlFor="video-upload"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer transition-colors active:scale-95"
              >
                <Video className="w-4 h-4 text-emerald-400" />
                <span>Record Video</span>
              </label>
            </div>

            {/* Video Warning Banner (if > 100MB or > 120s) */}
            {videoWarning && (
              <div className="mt-2.5 p-2.5 bg-amber-950/70 border border-amber-800/80 rounded-lg flex items-start gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>{videoWarning}</span>
              </div>
            )}

            {/* Previews */}
            {(selectedPhotos.length > 0 || selectedVideo) && (
              <div className="mt-3 flex flex-wrap gap-2.5">
                {selectedPhotos.map((photo, idx) => (
                  <div
                    key={idx}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700 bg-slate-800 group"
                  >
                    <img
                      src={photo.preview}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute top-0.5 right-0.5 bg-black/70 hover:bg-rose-600 p-0.5 rounded-full text-white transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {selectedVideo && (
                  <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-800 p-2 flex items-center gap-2">
                    <Video className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="text-xs">
                      <div className="font-semibold text-slate-200 truncate max-w-[140px]">
                        {selectedVideo.file.name}
                      </div>
                      <div className="text-slate-400 text-[10px]">
                        {(selectedVideo.file.size / (1024 * 1024)).toFixed(1)} MB
                        {selectedVideo.duration && ` • ${Math.round(selectedVideo.duration)}s`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeVideo}
                      className="p-1 hover:bg-rose-600 rounded text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-all shadow-md cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Recording Feedback...' : 'Submit Feedback'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
