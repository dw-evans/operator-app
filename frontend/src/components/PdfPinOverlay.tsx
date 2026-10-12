import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { FC, MouseEvent, TouchEvent } from 'react';
import { MapPin, X, Check, CheckCircle2, User, Clock, MessageSquare, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PdfPin } from '../types';
import { getMediaBlob } from '../services/db';
import { updateFeedbackComment } from '../services/api';

interface PositionedPin extends PdfPin {
  screenX: number;
  screenY: number;
}

interface PdfPinOverlayProps {
  viewerContainer: HTMLDivElement | null;
  pins: PdfPin[];
  isPlacingPin: boolean;
  initialPin?: { pageNumber: number; x: number; y: number } | null;
  onPinPlaced?: (coords: { pageNumber: number; x: number; y: number }) => void;
  onCancelPlacement?: () => void;
  onPinClick?: (pin: PdfPin) => void;
  onOpenDrawer?: (pin: PdfPin) => void;
  onViewPhoto?: (url: string) => void;
  onCommentUpdated?: (pinId: string, newComment: string) => void;
  onEditPin?: (pin: PdfPin) => void;
}

/**
 * Pure read-only helper to locate page elements inside EmbedPDF's shadow root.
 * Never mutates or alters any elements inside the shadow root.
 */
function getPageContainers(shadow: ShadowRoot): HTMLElement[] {
  // Method 1: Query white-background page containers created by EmbedPDF (zs component)
  const whiteBgElements = Array.from(
    shadow.querySelectorAll<HTMLElement>(
      'div[style*="background-color: #fff"], div[style*="background-color: rgb(255, 255, 255)"], div[style*="backgroundColor: #fff"]'
    )
  );

  if (whiteBgElements.length > 0) {
    return whiteBgElements.map((el) => {
      const parent = el.parentElement;
      return parent && parent.style.position === 'relative' ? parent : el;
    });
  }

  // Method 2: Query candidate page containers in .bg-bg-app
  const candidateDivs = Array.from(
    shadow.querySelectorAll<HTMLElement>('.bg-bg-app div[style*="position: relative"]')
  );
  return candidateDivs.filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 50 && rect.height > 50;
  });
}

export const PdfPinOverlay: FC<PdfPinOverlayProps> = ({
  viewerContainer,
  pins,
  isPlacingPin,
  initialPin,
  onPinPlaced,
  onCancelPlacement,
  onPinClick,
  onOpenDrawer,
  onViewPhoto,
  onCommentUpdated,
  onEditPin,
}) => {
  const [positionedPins, setPositionedPins] = useState<PositionedPin[]>([]);
  const [candidatePin, setCandidatePin] = useState<{
    pageNumber: number;
    x: number;
    y: number;
  } | null>(null);
  const [candidateScreenPos, setCandidateScreenPos] = useState<{
    screenX: number;
    screenY: number;
  } | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);

  // Pin comment inline editing state
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [editCommentText, setEditCommentText] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  useEffect(() => {
    setIsEditingComment(false);
    setEditCommentText('');
  }, [activePinId]);

  const scrollerElRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{
    x: number;
    y: number;
    scrollTop: number;
    scrollLeft: number;
    isDrag: boolean;
  } | null>(null);
  const lastTouchTimeRef = useRef<number>(0);

  // Sync candidate pin when entering or leaving placement mode
  useEffect(() => {
    if (isPlacingPin) {
      setCandidatePin(initialPin ?? null);
      setActivePinId(null);
    } else {
      setCandidatePin(null);
      setCandidateScreenPos(null);
    }
  }, [isPlacingPin, initialPin]);

  // Active pin with latest screen coordinates from positionedPins
  const activePin = useMemo(() => {
    if (!activePinId) return null;
    return positionedPins.find((p) => p.id === activePinId) || null;
  }, [activePinId, positionedPins]);

  const [activePinVideoSrc, setActivePinVideoSrc] = useState<string | null>(null);

  // Resolve video source for activePin (supports offline IndexedDB cached blobs)
  useEffect(() => {
    let currentObjectUrl: string | null = null;
    let isSubscribed = true;

    async function resolveVideo() {
      if (!activePin) {
        setActivePinVideoSrc(null);
        return;
      }

      if (activePin.videoFilename) {
        try {
          const cachedBlob = await getMediaBlob(activePin.videoFilename);
          if (cachedBlob && isSubscribed) {
            currentObjectUrl = URL.createObjectURL(cachedBlob);
            setActivePinVideoSrc(currentObjectUrl);
            return;
          }
        } catch {
          // ignore cache read failure
        }
      }

      if (isSubscribed) {
        const fallback =
          activePin.videoUrl ||
          (activePin.videoFilename ? `/media/${activePin.videoFilename}` : null);
        setActivePinVideoSrc(fallback);
      }
    }

    resolveVideo();

    return () => {
      isSubscribed = false;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [activePin]);

  // Close popup on click outside or Escape key
  useEffect(() => {
    if (!activePinId) return;

    const handleWindowClick = (e: MouseEvent | globalThis.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('.pin-comment-popup') && !target.closest('.assembly-pdf-pin')) {
        setActivePinId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePinId(null);
      }
    };

    window.addEventListener('click', handleWindowClick, { capture: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleWindowClick, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePinId]);

  // Compute adaptive popup position offset from the pin
  const popupPosition = useMemo(() => {
    if (!activePin || !viewerContainer) return null;
    const viewerRect = viewerContainer.getBoundingClientRect();
    const viewerWidth = viewerRect.width;
    const viewerHeight = viewerRect.height;

    // Desired popup width (adaptive to screen width)
    const popupWidth = Math.min(320, viewerWidth - 32);

    // Center over pin, clamped within viewer boundaries
    const idealLeft = activePin.screenX - popupWidth / 2;
    const clampedLeft = Math.max(16, Math.min(idealLeft, viewerWidth - popupWidth - 16));

    // Prefer placing above pin (pin tip is at screenY, top of pin is ~34px above).
    // If screenY is too close to top (< 220px), place below pin tip
    const placeBelow = activePin.screenY < 220;

    let style: React.CSSProperties;
    if (placeBelow) {
      style = {
        position: 'absolute',
        top: `${activePin.screenY + 14}px`,
        left: `${clampedLeft}px`,
        width: `${popupWidth}px`,
      };
    } else {
      style = {
        position: 'absolute',
        bottom: `${viewerHeight - activePin.screenY + 40}px`,
        left: `${clampedLeft}px`,
        width: `${popupWidth}px`,
      };
    }

    // Caret arrow horizontal offset relative to the popup
    const arrowLeft = Math.max(16, Math.min(activePin.screenX - clampedLeft, popupWidth - 16));

    return { style, placeBelow, arrowLeft };
  }, [activePin, viewerContainer]);

  // Calculate pixel positions for all pins relative to the viewer container
  const updatePinPositions = useCallback(() => {
    if (!viewerContainer) return;
    const embedEl = viewerContainer.querySelector('embedpdf-container');
    const shadow = embedEl?.shadowRoot;
    if (!shadow) return;

    const viewerRect = viewerContainer.getBoundingClientRect();
    const pages = getPageContainers(shadow);
    if (pages.length === 0) return;

    const updated: PositionedPin[] = [];

    pins.forEach((pin) => {
      const pageIdx = pin.pageNumber - 1;
      if (pageIdx >= 0 && pageIdx < pages.length) {
        const pageEl = pages[pageIdx];
        const pageRect = pageEl.getBoundingClientRect();

        if (pageRect.width > 0 && pageRect.height > 0) {
          const screenX = pageRect.left - viewerRect.left + (pageRect.width * pin.x) / 100;
          const screenY = pageRect.top - viewerRect.top + (pageRect.height * pin.y) / 100;

          updated.push({
            ...pin,
            screenX,
            screenY,
          });
        }
      }
    });

    setPositionedPins(updated);

    // Update candidate pin position if active
    if (candidatePin) {
      const pageIdx = candidatePin.pageNumber - 1;
      if (pageIdx >= 0 && pageIdx < pages.length) {
        const pageEl = pages[pageIdx];
        const pageRect = pageEl.getBoundingClientRect();
        if (pageRect.width > 0 && pageRect.height > 0) {
          const screenX = pageRect.left - viewerRect.left + (pageRect.width * candidatePin.x) / 100;
          const screenY = pageRect.top - viewerRect.top + (pageRect.height * candidatePin.y) / 100;
          setCandidateScreenPos({ screenX, screenY });
        }
      }
    } else {
      setCandidateScreenPos(null);
    }
  }, [viewerContainer, pins, candidatePin]);

  // Hook into scroller scroll events, resize, and initial page mounting
  useEffect(() => {
    if (!viewerContainer) return;

    let active = true;
    let animId: number;
    let scrollerEl: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    const onScrollOrResize = () => {
      cancelAnimationFrame(animId);
      animId = requestAnimationFrame(updatePinPositions);
    };

    const attachScroller = () => {
      if (!active || scrollerEl) return;
      const embedEl = viewerContainer.querySelector('embedpdf-container');
      const shadow = embedEl?.shadowRoot;
      if (!shadow) return;

      const found =
        shadow.querySelector('div[style*="overflow: auto"]') ||
        shadow.querySelector('.overflow-auto') ||
        shadow.querySelector('div[style*="overflow-y: auto"]');

      if (found) {
        scrollerEl = found as HTMLElement;
        scrollerElRef.current = scrollerEl;
        scrollerEl.addEventListener('scroll', onScrollOrResize, { passive: true });
        updatePinPositions();
      }
    };

    const watchShadow = () => {
      if (!active) return;
      const embedEl = viewerContainer.querySelector('embedpdf-container');
      const shadow = embedEl?.shadowRoot;
      if (!shadow) return;

      attachScroller();

      if (!observer) {
        observer = new MutationObserver(() => {
          attachScroller();
          onScrollOrResize();
        });
        observer.observe(shadow, { childList: true, subtree: true });
      }
    };

    watchShadow();

    // Poll during initial WASM load / document parsing (first 4 seconds)
    const interval = setInterval(() => {
      watchShadow();
      updatePinPositions();
    }, 200);

    const stopPolling = setTimeout(() => {
      clearInterval(interval);
    }, 4000);

    window.addEventListener('resize', onScrollOrResize, { passive: true });

    const ro = new ResizeObserver(() => {
      onScrollOrResize();
    });
    ro.observe(viewerContainer);

    // Initial positioning
    updatePinPositions();

    return () => {
      active = false;
      cancelAnimationFrame(animId);
      clearInterval(interval);
      clearTimeout(stopPolling);
      scrollerEl?.removeEventListener('scroll', onScrollOrResize);
      scrollerElRef.current = null;
      window.removeEventListener('resize', onScrollOrResize);
      observer?.disconnect();
      ro.disconnect();
    };
  }, [viewerContainer, pins, updatePinPositions]);

  // Place or adjust the candidate pin at specific viewport coordinates
  const placeCandidateAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!viewerContainer) return;
      const embedEl = viewerContainer.querySelector('embedpdf-container');
      const shadow = embedEl?.shadowRoot;
      if (!shadow) return;

      const pages = getPageContainers(shadow);
      if (pages.length === 0) return;

      const viewerRect = viewerContainer.getBoundingClientRect();

      // 1. Direct hit check
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];
        const rect = pageEl.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const rawX = ((clientX - rect.left) / rect.width) * 100;
          const rawY = ((clientY - rect.top) / rect.height) * 100;
          const coords = {
            pageNumber: i + 1,
            x: Number(Math.max(0, Math.min(100, rawX)).toFixed(1)),
            y: Number(Math.max(0, Math.min(100, rawY)).toFixed(1)),
          };
          setCandidatePin(coords);
          setCandidateScreenPos({
            screenX: clientX - viewerRect.left,
            screenY: clientY - viewerRect.top,
          });
          return;
        }
      }

      // 2. Proximity check (if user tapped slightly into margin)
      let closestIdx = 0;
      let minDistance = Infinity;
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];
        const rect = pageEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dist = Math.hypot(clientX - centerX, clientY - centerY);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }

      const pageEl = pages[closestIdx];
      const rect = pageEl.getBoundingClientRect();
      const rawX = ((clientX - rect.left) / rect.width) * 100;
      const rawY = ((clientY - rect.top) / rect.height) * 100;
      const coords = {
        pageNumber: closestIdx + 1,
        x: Number(Math.max(0, Math.min(100, rawX)).toFixed(1)),
        y: Number(Math.max(0, Math.min(100, rawY)).toFixed(1)),
      };
      setCandidatePin(coords);
      setCandidateScreenPos({
        screenX: rect.left - viewerRect.left + (rect.width * coords.x) / 100,
        screenY: rect.top - viewerRect.top + (rect.height * coords.y) / 100,
      });
    },
    [viewerContainer]
  );

  // Touch event handlers for seamless mobile panning and tap placement
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const scroller = scrollerElRef.current;
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        scrollTop: scroller?.scrollTop ?? 0,
        scrollLeft: scroller?.scrollLeft ?? 0,
        isDrag: false,
      };
    } else {
      touchStartRef.current = null;
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;

    if (Math.hypot(deltaX, deltaY) > 8) {
      touchStartRef.current.isDrag = true;
      const scroller = scrollerElRef.current;
      if (scroller) {
        scroller.scrollTop = touchStartRef.current.scrollTop - deltaY;
        scroller.scrollLeft = touchStartRef.current.scrollLeft - deltaX;
        updatePinPositions();
      }
    }
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    lastTouchTimeRef.current = Date.now();
    if (!touchStartRef.current) return;
    if (!touchStartRef.current.isDrag) {
      const touch = e.changedTouches[0];
      if (touch) {
        placeCandidateAt(touch.clientX, touch.clientY);
      }
    }
    touchStartRef.current = null;
  };

  const handlePlacementClick = (e: MouseEvent<HTMLDivElement>) => {
    // Avoid double firing from touch synthetic clicks
    if (Date.now() - lastTouchTimeRef.current < 400) {
      return;
    }
    placeCandidateAt(e.clientX, e.clientY);
  };

  // Confirm and save candidate pin placement
  const handleConfirm = () => {
    if (!candidatePin || !onPinPlaced) return;
    onPinPlaced(candidatePin);
  };

  // Cancel placement mode
  const handleCancel = () => {
    setCandidatePin(null);
    setCandidateScreenPos(null);
    onCancelPlacement?.();
  };

  return (
    <>
      {/* Visual Pins Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
        {positionedPins
          .filter((pin) => !(isPlacingPin && pin.isDraft))
          .map((pin) => (
            <div
              key={pin.id}
              style={{
                position: 'absolute',
                left: `${pin.screenX}px`,
                top: `${pin.screenY}px`,
                transform: 'translate(-50%, -100%)',
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!pin.isDraft) {
                  setActivePinId((prev) => (prev === pin.id ? null : pin.id));
                }
                onPinClick?.(pin);
              }}
              title={
                pin.author
                  ? `${pin.author}${pin.sectionRef ? ` (Sec ${pin.sectionRef})` : ''}: ${pin.comment || 'Note'}`
                  : `Note on Page ${pin.pageNumber}`
              }
              className={cn(
                "group transition-transform hover:scale-110 active:scale-95 assembly-pdf-pin",
                activePinId === pin.id && "scale-125 z-40 drop-shadow-[0_4px_10px_rgba(2,132,199,0.7)]"
              )}
            >
              {pin.isDraft ? (
                // Draft Pin with pulsating radar ring
                <div className="relative flex items-center justify-center">
                  <span className="absolute w-8 h-8 rounded-full bg-red-500/30 animate-ping" />
                  <svg
                    width="28"
                    height="34"
                    viewBox="0 0 28 34"
                    fill="none"
                    className="drop-shadow-[0_3px_6px_rgba(239,68,68,0.7)]"
                  >
                    <path
                      d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 20 14 20s14-9.5 14-20c0-7.732-6.268-14-14-14z"
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <circle cx="14" cy="13" r="4.5" fill="#ffffff" />
                  </svg>
                </div>
              ) : (
                // Saved Note Pin
                <div className="relative flex items-center justify-center">
                  <svg
                    width="24"
                    height="30"
                    viewBox="0 0 28 34"
                    fill="none"
                    className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                  >
                    <path
                      d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 20 14 20s14-9.5 14-20c0-7.732-6.268-14-14-14z"
                      fill="#0284c7"
                      stroke="#ffffff"
                      strokeWidth="1.8"
                    />
                    <circle cx="14" cy="13" r="4.5" fill="#ffffff" />
                  </svg>
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Popover Comment Card offset from Pin */}
      {activePin && popupPosition && !isPlacingPin && (
        <div
          style={popupPosition.style}
          onClick={(e) => e.stopPropagation()}
          className="pin-comment-popup z-40 bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-xl p-3.5 text-xs text-foreground animate-in fade-in zoom-in-95 duration-150 select-text max-h-[85vh] overflow-y-auto"
        >
          {/* Header: Author, Station, Status, Close */}
          <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-border/60">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="font-semibold text-foreground flex items-center gap-1 truncate">
                <User className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate">{activePin.author || 'Anonymous'}</span>
              </span>
              {activePin.stationId && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                  {activePin.stationId}
                </Badge>
              )}
              {activePin.status && (
                <Badge
                  variant={
                    activePin.status === 'resolved'
                      ? 'default'
                      : activePin.status === 'reviewed'
                      ? 'secondary'
                      : 'outline'
                  }
                  className="text-[9px] px-1.5 py-0 h-4 uppercase tracking-wider font-mono font-medium"
                >
                  {activePin.status}
                </Badge>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setActivePinId(null)}
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer -mr-1 -mt-0.5 rounded-full shrink-0"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Location & Time Badges */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground mb-2">
            <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-4.5">
              Page {activePin.pageNumber}
            </Badge>
            {activePin.sectionRef && (
              <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4.5 text-primary border-primary/30">
                Sec {activePin.sectionRef}
              </Badge>
            )}
            <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4.5 gap-1 text-muted-foreground">
              <MapPin className="w-2.5 h-2.5 text-primary" />
              <span>{activePin.x}%, {activePin.y}%</span>
            </Badge>
            {activePin.timestamp && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/80 ml-auto font-mono">
                <Clock className="w-2.5 h-2.5" />
                <span>{new Date(activePin.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </span>
            )}
          </div>

          {/* Comment Text */}
          {isEditingComment ? (
            <div className="mb-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={editCommentText}
                onChange={(e) => setEditCommentText(e.target.value)}
                className="w-full text-xs font-normal border border-input rounded-md p-2 bg-background text-foreground focus:ring-1 focus:ring-ring focus:outline-none resize-y min-h-[60px]"
                placeholder="Write a comment..."
                rows={3}
                autoFocus
              />
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setIsEditingComment(false)}
                  disabled={isSavingComment}
                  className="h-6 px-2 text-[11px] cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  onClick={async () => {
                    setIsSavingComment(true);
                    try {
                      await updateFeedbackComment(activePin.id, editCommentText);
                      activePin.comment = editCommentText;
                      onCommentUpdated?.(activePin.id, editCommentText);
                      setIsEditingComment(false);
                    } catch (err) {
                      console.error('Failed to update pin comment:', err);
                      alert('Failed to save comment');
                    } finally {
                      setIsSavingComment(false);
                    }
                  }}
                  disabled={isSavingComment}
                  className="h-6 px-2.5 text-[11px] gap-1 cursor-pointer font-medium"
                >
                  {isSavingComment ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  <span>Save</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="mb-2.5 bg-muted/30 rounded-lg p-2.5 border border-border/40 text-foreground/90 whitespace-pre-line leading-relaxed max-h-36 overflow-y-auto text-[12px] group relative">
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1">
                  {activePin.comment ? (
                    activePin.comment
                  ) : (
                    <span className="italic text-muted-foreground">No text comment provided</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onEditPin) {
                      const pin = activePin;
                      setActivePinId(null);
                      onEditPin(pin);
                    } else {
                      setEditCommentText(activePin.comment || '');
                      setIsEditingComment(true);
                    }
                  }}
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer -mt-0.5 -mr-0.5 shrink-0"
                  title="Edit note"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Photo Previews if any */}
          {activePin.photoUrls && activePin.photoUrls.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-2.5">
              {activePin.photoUrls.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onViewPhoto) {
                      onViewPhoto(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="relative w-12 h-12 rounded-md overflow-hidden border border-border/80 shrink-0 hover:border-primary transition-colors cursor-pointer group"
                  title="View full photo"
                >
                  <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </button>
              ))}
            </div>
          )}

          {/* Video Preview / Player if present in the note */}
          {(activePinVideoSrc || activePin.videoUrl || activePin.videoFilename) && (
            <div className="mb-2.5 rounded-lg overflow-hidden border border-border/80 bg-black/95">
              <video
                controls
                playsInline
                preload="metadata"
                src={
                  activePinVideoSrc ||
                  activePin.videoUrl ||
                  (activePin.videoFilename ? `/media/${activePin.videoFilename}` : undefined)
                }
                className="w-full max-h-48 rounded-lg object-contain bg-black"
              />
              {activePin.videoFilename && (
                <div className="px-2 py-1 text-[10px] text-muted-foreground font-mono flex items-center justify-between bg-card/60 border-t border-border/40">
                  <span className="truncate">{activePin.videoFilename}</span>
                  <span className="text-[9px] uppercase tracking-wider text-primary font-medium">Video</span>
                </div>
              )}
            </div>
          )}

          {/* Footer Action: View in Notes Drawer */}
          <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px]">
            <span className="text-muted-foreground text-[10px]">
              Tap outside to close
            </span>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                const pin = activePin;
                setActivePinId(null);
                onOpenDrawer?.(pin);
              }}
              className="h-6 px-2.5 text-[11px] gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer font-medium rounded-lg transition-all active:scale-95"
            >
              <MessageSquare className="w-3 h-3" />
              <span>View in Notes</span>
            </Button>
          </div>

          {/* Directional Caret / Arrow Indicator */}
          <div
            style={{
              left: `${popupPosition.arrowLeft}px`,
              transform: 'translateX(-50%)',
            }}
            className={cn(
              "absolute w-2.5 h-2.5 bg-card border-border rotate-45 pointer-events-none",
              popupPosition.placeBelow
                ? "-top-1.5 border-t border-l"
                : "-bottom-1.5 border-b border-r"
            )}
          />
        </div>
      )}

      {/* Placement Mode Interactive Background Area */}
      {isPlacingPin && (
        <div
          onClick={handlePlacementClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="absolute inset-0 z-40 cursor-crosshair bg-primary/10 select-none"
        />
      )}

      {/* Candidate Pin Preview during Placement */}
      {isPlacingPin && candidateScreenPos && candidatePin && (
        <div
          style={{
            position: 'absolute',
            left: `${candidateScreenPos.screenX}px`,
            top: `${candidateScreenPos.screenY}px`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
          }}
          className="z-50 select-none animate-in fade-in zoom-in-75 duration-150"
        >
          {/* Coordinates Tooltip Pill */}
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/85 text-white font-mono text-[10px] px-2 py-0.5 rounded shadow-lg border border-white/10 pointer-events-none">
            Page {candidatePin.pageNumber} · {candidatePin.x}%, {candidatePin.y}%
          </div>

          {/* Pin Graphic */}
          <div className="relative flex items-center justify-center">
            {/* Pulsating Radar Rings */}
            <span className="absolute w-12 h-12 rounded-full bg-red-500/25 animate-ping" />
            <span className="absolute w-6 h-6 rounded-full bg-red-500/40" />

            <svg
              width="32"
              height="40"
              viewBox="0 0 28 34"
              fill="none"
              className="drop-shadow-[0_4px_10px_rgba(239,68,68,0.8)] filter"
            >
              <path
                d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 20 14 20s14-9.5 14-20c0-7.732-6.268-14-14-14z"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="2.2"
              />
              <circle cx="14" cy="13" r="5" fill="#ffffff" />
            </svg>
          </div>

          {/* Precision Target Crosshair at the coordinate tip */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '100%',
              transform: 'translate(-50%, -50%)',
            }}
            className="w-3.5 h-3.5 rounded-full border-2 border-red-500 bg-white/95 shadow-sm flex items-center justify-center pointer-events-none"
          >
            <div className="w-1 h-1 rounded-full bg-red-600" />
          </div>
        </div>
      )}

      {/* Top Banner Guide */}
      {isPlacingPin && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/95 border border-primary/50 text-foreground shadow-2xl px-4 py-2 rounded-full flex items-center gap-2.5 text-xs font-medium z-50 pointer-events-auto backdrop-blur-sm animate-in fade-in slide-in-from-top-2 select-none"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {candidatePin ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Tap to adjust pin, or tap <strong>Continue</strong></span>
            </>
          ) : (
            <>
              <MapPin className="w-4 h-4 text-primary animate-bounce shrink-0" />
              <span>Tap anywhere on the drawing to place pin</span>
            </>
          )}
        </div>
      )}

      {/* Bottom Right Confirmation & Cancel Floating Toolbar */}
      {isPlacingPin && (
        <div
          className="absolute bottom-6 right-4 sm:bottom-8 sm:right-6 z-50 flex items-center gap-2 pointer-events-auto select-none"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Cancel Button with X */}
          <Button
            type="button"
            variant="secondary"
            size="default"
            onClick={handleCancel}
            className="h-10 px-3.5 gap-1.5 text-xs font-medium rounded-full shadow-lg bg-background/95 hover:bg-muted border border-border/80 backdrop-blur-md cursor-pointer transition-all active:scale-95 text-foreground"
          >
            <X className="w-4 h-4 text-muted-foreground" />
            <span>Cancel</span>
          </Button>

          {/* Continue Button with Checkmark */}
          <Button
            type="button"
            variant="default"
            size="default"
            disabled={!candidatePin}
            onClick={handleConfirm}
            className={cn(
              "h-10 px-4 gap-2 text-xs font-semibold rounded-full shadow-xl transition-all active:scale-95",
              candidatePin
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/30 ring-2 ring-primary/40 cursor-pointer"
                : "opacity-50 cursor-not-allowed bg-muted text-muted-foreground ring-0 shadow-none"
            )}
          >
            <span>Continue</span>
            <Check className="w-4 h-4 stroke-[2.5]" />
          </Button>
        </div>
      )}
    </>
  );
};
