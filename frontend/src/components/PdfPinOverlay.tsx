import { useState, useEffect, useCallback } from 'react';
import type { FC, MouseEvent } from 'react';
import { MapPin, X } from 'lucide-react';
import type { PdfPin } from '../types';

interface PositionedPin extends PdfPin {
  screenX: number;
  screenY: number;
}

interface PdfPinOverlayProps {
  viewerContainer: HTMLDivElement | null;
  pins: PdfPin[];
  isPlacingPin: boolean;
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
  onPinPlaced,
  onCancelPlacement,
  onPinClick,
}) => {
  const [positionedPins, setPositionedPins] = useState<PositionedPin[]>([]);

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
  }, [viewerContainer, pins]);

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
      window.removeEventListener('resize', onScrollOrResize);
      observer?.disconnect();
      ro.disconnect();
    };
  }, [viewerContainer, pins, updatePinPositions]);

  // Handle click during pin placement mode
  const handlePlacementClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onPinPlaced || !viewerContainer) return;
    const embedEl = viewerContainer.querySelector('embedpdf-container');
    const shadow = embedEl?.shadowRoot;
    if (!shadow) return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    const pages = getPageContainers(shadow);
    if (pages.length === 0) return;

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
        onPinPlaced({
          pageNumber: i + 1,
          x: Number(Math.max(0, Math.min(100, rawX)).toFixed(1)),
          y: Number(Math.max(0, Math.min(100, rawY)).toFixed(1)),
        });
        return;
      }
    }

    // 2. Proximity check (if user clicked slightly into margin)
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
    onPinPlaced({
      pageNumber: closestIdx + 1,
      x: Number(Math.max(0, Math.min(100, rawX)).toFixed(1)),
      y: Number(Math.max(0, Math.min(100, rawY)).toFixed(1)),
    });
  };

  return (
    <>
      {/* Visual Pins Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
        {positionedPins.map((pin) => (
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

      {/* Placement Mode Interactive Overlay */}
      {isPlacingPin && (
        <div
          onClick={handlePlacementClick}
          className="absolute inset-0 z-40 cursor-crosshair bg-primary/10 select-none"
        >
          {/* Top Banner Guide */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/95 border border-primary/50 text-foreground shadow-2xl px-4 py-2 rounded-full flex items-center gap-2.5 text-xs font-medium z-50 pointer-events-auto backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
            <MapPin className="w-4 h-4 text-primary animate-bounce shrink-0" />
            <span>Tap anywhere on the drawing to place pin</span>
            {onCancelPlacement && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelPlacement();
                }}
                className="ml-2 px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
              >
                <X className="w-3 h-3" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
