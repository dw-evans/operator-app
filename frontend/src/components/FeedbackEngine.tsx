import { useState, useRef, useEffect } from 'react';
import type { FC, FormEvent, ChangeEvent } from 'react';
import { Camera, Video, Send, AlertTriangle, X, CheckCircle2, MapPin } from 'lucide-react';
import { enqueueFeedback } from '../services/db';
import { submitFeedbackDirect } from '../services/api';
import { syncManager } from '../services/sync';
import type { QueuedFeedback } from '../types';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface FeedbackEngineProps {
  slotId: number;
  documentId?: number;
  initialPageRef?: number;
  draftPin?: { pageNumber: number; x: number; y: number } | null;
  onStartPinPlacement?: () => void;
  onClearDraftPin?: () => void;
  onFeedbackSubmitted: () => void;
}

export const FeedbackEngine: FC<FeedbackEngineProps> = ({
  slotId,
  documentId,
  initialPageRef,
  draftPin,
  onStartPinPlacement,
  onClearDraftPin,
  onFeedbackSubmitted,
}) => {
  const stationId = localStorage.getItem('assembly_station_id') || 'Station 1';
  const [author, setAuthor] = useState(
    () => localStorage.getItem('assembly_author') || ''
  );
  const [pageRef, setPageRef] = useState<number>(initialPageRef || 1);
  const [sectionRef, setSectionRef] = useState('');
  const [pinCoords, setPinCoords] = useState<{ x: number; y: number } | null>(
    draftPin ? { x: draftPin.x, y: draftPin.y } : null
  );

  useEffect(() => {
    if (initialPageRef !== undefined && initialPageRef > 0) {
      setPageRef(initialPageRef);
    }
  }, [initialPageRef]);

  useEffect(() => {
    if (draftPin) {
      setPinCoords({ x: draftPin.x, y: draftPin.y });
      if (draftPin.pageNumber > 0) {
        setPageRef(draftPin.pageNumber);
      }
    }
  }, [draftPin]);
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

  // Persist author in localStorage

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
        formData.append('station_id', stationId || 'Station 1');
        formData.append('slot_id', slotId.toString());
        if (documentId !== undefined) {
          formData.append('document_id', documentId.toString());
        }
        formData.append('page_ref', pageRef.toString());
        if (sectionRef.trim()) {
          formData.append('section_ref', sectionRef.trim());
        }
        formData.append('pin_x', (pinCoords?.x ?? 0.0).toString());
        formData.append('pin_y', (pinCoords?.y ?? 0.0).toString());
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
        syncManager.recordSuccessfulSync();
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
        station_id: stationId || 'Station 1',
        slot_id: slotId,
        document_id: documentId,
        page_ref: pageRef,
        section_ref: sectionRef.trim() || undefined,
        pin_x: pinCoords?.x ?? 0.0,
        pin_y: pinCoords?.y ?? 0.0,
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
    setSectionRef('');
    setPinCoords(null);
    onClearDraftPin?.();
    setSelectedPhotos([]);
    removeVideo();
    setIsSubmitting(false);
  };

  return (
    <Card className="p-4 md:p-5 flex flex-col justify-between shadow-sm">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-card-foreground text-sm md:text-base">
              Submit Station Note
            </h3>
            <Badge variant="outline" className="text-xs font-mono font-medium">
              Slot {slotId}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Offline sync active
          </div>
        </div>

        {submitMessage && (
          <Alert
            variant={submitMessage.type === 'error' ? 'destructive' : 'default'}
            className={cn(
              'mb-4',
              submitMessage.type === 'success' && 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
              submitMessage.type === 'queued' && 'border-amber-500/40 text-amber-400 bg-amber-500/10'
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{submitMessage.text}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Metadata Rows: Operator Name, Section Reference, Page Reference & Pin */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Operator Name / ID *
              </label>
              <Input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Alex"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Section / Subsection
              </label>
              <Input
                type="text"
                value={sectionRef}
                onChange={(e) => setSectionRef(e.target.value)}
                placeholder="e.g. 1.4"
                className="font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1 flex items-center justify-between">
                <span>Page Reference & Pin *</span>
                <span className="text-[10px] text-primary font-mono font-semibold">Synced</span>
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  required
                  value={pageRef}
                  onChange={(e) => setPageRef(parseInt(e.target.value, 10) || 1)}
                  className="font-mono bg-muted/20 w-28 shrink-0"
                />
                <Button
                  type="button"
                  variant={pinCoords ? "secondary" : "outline"}
                  size="sm"
                  onClick={onStartPinPlacement}
                  title={pinCoords ? `Pin placed at ${pinCoords.x}%, ${pinCoords.y}%. Click to reposition.` : "Drop pin on page"}
                  className="h-9 px-3 gap-1.5 text-xs flex-1 cursor-pointer"
                >
                  <MapPin className={cn("w-3.5 h-3.5", pinCoords ? "text-primary" : "text-muted-foreground")} />
                  <span>{pinCoords ? `Pin: ${pinCoords.x}%, ${pinCoords.y}%` : 'Drop Pin on Page'}</span>
                </Button>
                {pinCoords && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setPinCoords(null);
                      onClearDraftPin?.();
                    }}
                    className="h-9 w-9 text-muted-foreground hover:text-destructive cursor-pointer"
                    title="Remove pin"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Comment Textarea */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              Feedback Notes / Description
            </label>
            <textarea
              rows={3}
              value={textComment}
              onChange={(e) => setTextComment(e.target.value)}
              placeholder="Describe assembly issue, missing step, torque spec, or discrepancy..."
              className="w-full rounded-lg border border-input bg-transparent p-3 text-xs md:text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none resize-none dark:bg-input/30"
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
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'cursor-pointer gap-1.5'
                )}
              >
                <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Add Photo</span>
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
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'sm' }),
                  'cursor-pointer gap-1.5'
                )}
              >
                <Video className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Record Video</span>
              </label>
            </div>

            {/* Video Warning Banner (if > 100MB or > 120s) */}
            {videoWarning && (
              <div className="mt-2.5 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2 text-xs text-amber-400">
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
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted/40 group"
                  >
                    <img
                      src={photo.preview}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 bg-black/80 hover:bg-destructive p-0.5 rounded text-white transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {selectedVideo && (
                  <div className="relative rounded-lg overflow-hidden border border-border bg-muted/40 p-2 flex items-center gap-2">
                    <Video className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="text-xs">
                      <div className="font-medium text-foreground truncate max-w-[140px]">
                        {selectedVideo.file.name}
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        {(selectedVideo.file.size / (1024 * 1024)).toFixed(1)} MB
                        {selectedVideo.duration && ` • ${Math.round(selectedVideo.duration)}s`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeVideo}
                      className="p-1 hover:bg-destructive rounded text-muted-foreground hover:text-destructive-foreground transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Recording Note...' : 'Submit Note'}</span>
          </Button>
        </form>
      </div>
    </Card>
  );
};
