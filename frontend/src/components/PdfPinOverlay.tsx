import { useState, useEffect, useCallback, useRef } from 'react';
import type { FC, MouseEvent, TouchEvent } from 'react';
import { MapPin, X, Check, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PdfPin } from '../types';

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
    } else {
      setCandidatePin(null);
      setCandidateScreenPos(null);
    }
  }, [isPlacingPin, initialPin]);

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
                onPinClick?.(pin);
              }}
              title={
                pin.author
                  ? `${pin.author}${pin.sectionRef ? ` (Sec ${pin.sectionRef})` : ''}: ${pin.comment || 'Note'}`
                  : `Note on Page ${pin.pageNumber}`
              }
              className="group transition-transform hover:scale-110 active:scale-95"
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
