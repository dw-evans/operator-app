import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { FC, MouseEvent, TouchEvent } from 'react';
import { MapPin, X, Check, CheckCircle2, User, Clock, MessageSquare, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatNoteDateTime } from '@/lib/utils';
import type { PdfPin } from '../types';
import { getMediaBlob } from '../services/db';
import { updateFeedbackComment } from '../services/api';

interface PositionedPin extends PdfPin {
  screenX: number;
  screenY: number;
}

export interface PdfPinOverlayProps {
  viewerContainer: HTMLDivElement | null;
  pins: PdfPin[];
  selectedPinId?: string | null;
  selectedPinSeq?: number;
  onActivePinChange?: (pinId: string | null) => void;
  isPlacingPin: boolean;
  initialPin?: { pageNumber: number; x: number; y: number } | null;
  onPinPlaced?: (coords: { pageNumber: number; x: number; y: number }) => void;
  onCancelPlacement?: () => void;
  onPinClick?: (pin: PdfPin) => void;
  onOpenDrawer?: (pin: PdfPin) => void;
  onViewPhoto?: (url: string) => void;
  onCommentUpdated?: (pinId: string, newComment: string) => void;
  onEditPin?: (pin: PdfPin) => void;
  onDeletePin?: (pin: PdfPin) => void;
  scrollPlugin?: any;
}

export interface RenderedPageInfo {
  pageNumber: number;
  element: HTMLElement;
  rect: DOMRect;
}

/**
 * Maps currently rendered DOM page elements to their true 1-based page numbers in EmbedPDF's virtualized scroller.
 * Resolves virtual scroller offsets so pins and click/tap placements accurately lock to true document pages.
 */
export function getRenderedPages(
  shadow: ShadowRoot,
  scrollPlugin?: any
): Map<number, RenderedPageInfo> {
  const result = new Map<number, RenderedPageInfo>();

  // 1. Locate the page container DOM elements currently mounted in the shadow DOM
  const whiteBgElements = Array.from(
    shadow.querySelectorAll<HTMLElement>(
      'div[style*="background-color: #fff"], div[style*="background-color: rgb(255, 255, 255)"], div[style*="backgroundColor: #fff"]'
    )
  );

  let pageElements: HTMLElement[] = [];
  if (whiteBgElements.length > 0) {
    pageElements = whiteBgElements.map((el) => {
      const parent = el.parentElement;
      return parent && parent.style.position === 'relative' ? parent : el;
    });
  } else {
    pageElements = Array.from(
      shadow.querySelectorAll<HTMLElement>('.bg-bg-app div[style*="position: relative"]')
    ).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 50 && rect.height > 50;
    });
  }

  if (pageElements.length === 0) {
    return result;
  }

  // 2. Resolve true 1-based page numbers for each mounted page element
  let pageNumbers: number[] | null = null;

  // Tier 1: EmbedPDF ScrollPlugin internal state (renderedPageIndexes / getScrollerLayout)
  if (scrollPlugin) {
    try {
      // Method A: docState.renderedPageIndexes (0-based indices)
      const docState = typeof scrollPlugin.getDocumentState === 'function' ? scrollPlugin.getDocumentState() : null;
      if (
        Array.isArray(docState?.renderedPageIndexes) &&
        docState.renderedPageIndexes.length === pageElements.length
      ) {
        pageNumbers = docState.renderedPageIndexes.map((idx: number) => idx + 1);
      }

      // Method B: getScrollerLayout().items
      if (!pageNumbers && typeof scrollPlugin.getScrollerLayout === 'function') {
        const layout = scrollPlugin.getScrollerLayout();
        if (Array.isArray(layout?.items) && layout.items.length === pageElements.length) {
          const resolved = layout.items
            .map((item: any) => item.pageLayouts?.[0]?.pageNumber)
            .filter((n: any): n is number => typeof n === 'number' && n > 0);
          if (resolved.length === pageElements.length) {
            pageNumbers = resolved;
          }
        }
      }
    } catch {
      // fallback to DOM spacer analysis
    }
  }

  // Tier 2: Inspect top spacer in virtual scroller container against layout offsets
  if (!pageNumbers) {
    try {
      const firstEl = pageElements[0];
      let topSpacer: HTMLElement | null = null;
      let curr: HTMLElement | null = firstEl;
      while (curr && curr.parentElement && (curr as any) !== shadow) {
        const parentNode: HTMLElement | null = curr.parentElement;
        if (parentNode && parentNode.children.length === 3 && parentNode.children[1].contains(curr)) {
          topSpacer = parentNode.children[0] as HTMLElement;
          break;
        }
        curr = parentNode;
      }

      if (topSpacer) {
        const startSpacing = parseFloat(topSpacer.style.height || topSpacer.style.width || '') || 0;
        if (startSpacing <= 5) {
          // Top of document: pages start at 1
          pageNumbers = pageElements.map((_, i) => i + 1);
        } else {
          // Check virtualItems offsets via scrollPlugin layout
          const layout = typeof scrollPlugin?.getLayout === 'function' ? scrollPlugin.getLayout() : null;
          const virtualItems = layout?.virtualItems;
          if (Array.isArray(virtualItems) && virtualItems.length > 0) {
            const firstRect = firstEl.getBoundingClientRect();
            const firstItem = virtualItems[0];
            const scale = firstItem && firstItem.width > 0 ? firstRect.width / firstItem.width : 1;
            const matchIndex = virtualItems.findIndex((item: any) => {
              const expectedOffset = (item.offset ?? 0) * scale;
              return Math.abs(expectedOffset - startSpacing) < 8;
            });
            if (matchIndex >= 0) {
              const startPageNum = matchIndex + 1;
              pageNumbers = pageElements.map((_, i) => startPageNum + i);
            }
          }

          // Tier 3: Uniform height fallback based on page height
          if (!pageNumbers) {
            const pageHeight = firstEl.getBoundingClientRect().height;
            if (pageHeight > 50) {
              const pagesAbove = Math.round(startSpacing / (pageHeight + 20));
              const startPageNum = Math.max(1, pagesAbove + 1);
              pageNumbers = pageElements.map((_, i) => startPageNum + i);
            }
          }
        }
      }
    } catch {
      // fallback to 1:1
    }
  }

  // Tier 4: Total fallback (assume 1:1 if virtualization offsets cannot be determined)
  if (!pageNumbers || pageNumbers.length !== pageElements.length) {
    pageNumbers = pageElements.map((_, i) => i + 1);
  }

  // 3. Assemble result map
  for (let i = 0; i < pageElements.length; i++) {
    const el = pageElements[i];
    const pageNumber = pageNumbers[i];
    const rect = el.getBoundingClientRect();
    result.set(pageNumber, {
      pageNumber,
      element: el,
      rect,
    });
  }

  return result;
}

/**
 * Pure read-only helper to locate page elements inside EmbedPDF's shadow root.
 * Preserved for backwards compatibility with external consumers.
 */
export function getPageContainers(shadow: ShadowRoot): HTMLElement[] {
  const rendered = getRenderedPages(shadow);
  return Array.from(rendered.values()).map((p) => p.element);
}

export const PdfPinOverlay: FC<PdfPinOverlayProps> = ({
  viewerContainer,
  pins,
  selectedPinId,
  selectedPinSeq,
  onActivePinChange,
  isPlacingPin,
  initialPin,
  onPinPlaced,
  onCancelPlacement,
  onPinClick,
  onOpenDrawer,
  onViewPhoto,
  onCommentUpdated,
  onEditPin,
  onDeletePin,
  scrollPlugin,
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

  const handleSetActivePinId = useCallback(
    (newId: string | null | ((prev: string | null) => string | null)) => {
      setActivePinId((prev) => {
        const next = typeof newId === 'function' ? newId(prev) : newId;
        if (next !== prev) {
          onActivePinChange?.(next);
        }
        return next;
      });
    },
    [onActivePinChange]
  );

  const [isDraggingPin, setIsDraggingPin] = useState(false);

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
      handleSetActivePinId(null);
    } else {
      setCandidatePin(null);
      setCandidateScreenPos(null);
      setIsDraggingPin(false);
    }
  }, [isPlacingPin, initialPin, handleSetActivePinId]);

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
      if (
        target &&
        !target.closest('.pin-comment-popup') &&
        !target.closest('.assembly-pdf-pin') &&
        !target.closest('aside')
      ) {
        handleSetActivePinId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSetActivePinId(null);
      }
    };

    window.addEventListener('click', handleWindowClick, { capture: true });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleWindowClick, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePinId, handleSetActivePinId]);

  // Compute adaptive popup position offset from the pin
  const popupPosition = useMemo(() => {
    if (!activePin || !viewerContainer) return null;
    const viewerRect = viewerContainer.getBoundingClientRect();
    const viewerWidth = viewerRect.width;
    const viewerHeight = viewerRect.height;

    // Desired popup width (adaptive to screen width)
    const popupWidth = Math.min(380, viewerWidth - 32);

    // Center over pin, clamped within viewer boundaries
    const idealLeft = activePin.screenX - popupWidth / 2;
    const clampedLeft = Math.max(16, Math.min(idealLeft, viewerWidth - popupWidth - 16));

    // Prefer placing above pin (pin circle diameter is ~28px, centered at screenY).
    // If screenY is too close to top (< 220px), place below pin
    const placeBelow = activePin.screenY < 220;

    let style: React.CSSProperties;
    if (placeBelow) {
      style = {
        position: 'absolute',
        top: `${activePin.screenY + 20}px`,
        left: `${clampedLeft}px`,
        width: `${popupWidth}px`,
      };
    } else {
      style = {
        position: 'absolute',
        bottom: `${viewerHeight - activePin.screenY + 20}px`,
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
    const renderedPages = getRenderedPages(shadow, scrollPlugin);
    if (renderedPages.size === 0) return;

    const updated: PositionedPin[] = [];

    pins.forEach((pin) => {
      const page = renderedPages.get(pin.pageNumber);
      if (page && page.rect.width > 0 && page.rect.height > 0) {
        const pageRect = page.rect;
        const screenX = pageRect.left - viewerRect.left + (pageRect.width * pin.x) / 100;
        const screenY = pageRect.top - viewerRect.top + (pageRect.height * pin.y) / 100;

        updated.push({
          ...pin,
          screenX,
          screenY,
        });
      }
    });

    setPositionedPins(updated);

    // Update candidate pin position if active
    if (candidatePin) {
      const page = renderedPages.get(candidatePin.pageNumber);
      if (page && page.rect.width > 0 && page.rect.height > 0) {
        const pageRect = page.rect;
        const screenX = pageRect.left - viewerRect.left + (pageRect.width * candidatePin.x) / 100;
        const screenY = pageRect.top - viewerRect.top + (pageRect.height * candidatePin.y) / 100;
        setCandidateScreenPos({ screenX, screenY });
      } else {
        setCandidateScreenPos(null);
      }
    } else {
      setCandidateScreenPos(null);
    }
  }, [viewerContainer, pins, candidatePin, scrollPlugin]);

  // Synchronize externally selected pin (e.g. clicked in comment list) with active pin popup
  useEffect(() => {
    if (selectedPinId) {
      setActivePinId(selectedPinId);
      updatePinPositions();
      const t1 = setTimeout(updatePinPositions, 100);
      const t2 = setTimeout(updatePinPositions, 300);
      const t3 = setTimeout(updatePinPositions, 600);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    } else {
      setActivePinId(null);
    }
  }, [selectedPinId, selectedPinSeq, updatePinPositions]);

  // When an active pin is selected, if its position lands off-screen, gently scroll into view
  useEffect(() => {
    if (!activePinId) return;
    const centerTimer = setTimeout(() => {
      if (!scrollerElRef.current || !viewerContainer) return;
      const currentActive = positionedPins.find((p) => p.id === activePinId);
      if (!currentActive) return;
      const vHeight = viewerContainer.clientHeight;
      if (currentActive.screenY < 80 || currentActive.screenY > vHeight - 80) {
        const deltaY = currentActive.screenY - vHeight / 2;
        scrollerElRef.current.scrollBy({ top: deltaY, behavior: 'smooth' });
      }
    }, 350);
    return () => clearTimeout(centerTimer);
  }, [activePinId, positionedPins, viewerContainer]);

  // Hook into scroller scroll events, resize, and initial page mounting
  useEffect(() => {
    if (!viewerContainer) return;

    let active = true;
    let animId: number;
    let scrollerEl: HTMLElement | null = null;
    let observer: MutationObserver | null = null;
    let scrollerLayoutUnsub: (() => void) | null = null;

    const onScrollOrResize = () => {
      cancelAnimationFrame(animId);
      animId = requestAnimationFrame(updatePinPositions);
    };

    if (scrollPlugin && typeof scrollPlugin.onScrollerData === 'function') {
      try {
        scrollerLayoutUnsub = scrollPlugin.onScrollerData(undefined, () => {
          onScrollOrResize();
        });
      } catch {
        // fallback
      }
    }

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
      if (typeof scrollerLayoutUnsub === 'function') {
        scrollerLayoutUnsub();
      }
      scrollerEl?.removeEventListener('scroll', onScrollOrResize);
      scrollerElRef.current = null;
      window.removeEventListener('resize', onScrollOrResize);
      observer?.disconnect();
      ro.disconnect();
    };
  }, [viewerContainer, pins, updatePinPositions, scrollPlugin]);

  // Place or adjust the candidate pin at specific viewport coordinates
  const placeCandidateAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!viewerContainer) return;
      const embedEl = viewerContainer.querySelector('embedpdf-container');
      const shadow = embedEl?.shadowRoot;
      if (!shadow) return;

      const renderedPages = getRenderedPages(shadow, scrollPlugin);
      if (renderedPages.size === 0) return;

      const viewerRect = viewerContainer.getBoundingClientRect();

      // 1. Direct hit check
      for (const page of renderedPages.values()) {
        const rect = page.rect;
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const rawX = ((clientX - rect.left) / rect.width) * 100;
          const rawY = ((clientY - rect.top) / rect.height) * 100;
          const coords = {
            pageNumber: page.pageNumber,
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
      let closestPage: RenderedPageInfo | null = null;
      let minDistance = Infinity;
      for (const page of renderedPages.values()) {
        const rect = page.rect;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dist = Math.hypot(clientX - centerX, clientY - centerY);
        if (dist < minDistance) {
          minDistance = dist;
          closestPage = page;
        }
      }

      if (closestPage) {
        const rect = closestPage.rect;
        const rawX = ((clientX - rect.left) / rect.width) * 100;
        const rawY = ((clientY - rect.top) / rect.height) * 100;
        const coords = {
          pageNumber: closestPage.pageNumber,
          x: Number(Math.max(0, Math.min(100, rawX)).toFixed(1)),
          y: Number(Math.max(0, Math.min(100, rawY)).toFixed(1)),
        };
        setCandidatePin(coords);
        setCandidateScreenPos({
          screenX: rect.left - viewerRect.left + (rect.width * coords.x) / 100,
          screenY: rect.top - viewerRect.top + (rect.height * coords.y) / 100,
        });
      }
    },
    [viewerContainer, scrollPlugin]
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

  // Mouse drag support for candidate pin during placement
  useEffect(() => {
    if (!isDraggingPin) return;
    const onGlobalMouseMove = (e: globalThis.MouseEvent) => {
      placeCandidateAt(e.clientX, e.clientY);
    };
    const onGlobalMouseUp = () => {
      setIsDraggingPin(false);
    };
    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };
  }, [isDraggingPin, placeCandidateAt]);

  const handleMouseDownOnPin = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingPin(true);
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
          .map((pin) => {
            const isSelected = activePinId === pin.id || selectedPinId === pin.id;

            return (
              <div
                key={pin.id}
                style={{
                  position: 'absolute',
                  left: `${pin.screenX}px`,
                  top: `${pin.screenY}px`,
                  transform: isSelected
                    ? 'translate(-50%, -50%) scale(1.2)'
                    : 'translate(-50%, -50%) scale(1)',
                  opacity: isSelected ? 0.7 : 0.4,
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!pin.isDraft) {
                    handleSetActivePinId((prev) => (prev === pin.id ? null : pin.id));
                  }
                  onPinClick?.(pin);
                }}
                title={
                  pin.author
                    ? `${pin.author}${pin.status ? ` (${pin.status})` : ''} · Page ${pin.pageNumber}: ${pin.comment || 'Note'}`
                    : `Note on Page ${pin.pageNumber}`
                }
                className={cn(
                  "assembly-pdf-pin rounded-full transition-all duration-200 ease-out select-none flex items-center justify-center",
                  "w-7 h-7 sm:w-8 sm:h-8",
                  "bg-red-500 border border-red-600 shadow-sm",
                  "hover:opacity-60",
                  isSelected && "z-40 shadow-md ring-2 ring-red-400/60"
                )}
              >
                {pin.isDraft && (
                  <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60 pointer-events-none" />
                )}
              </div>
            );
          })}
      </div>

      {/* Popover Comment Card offset from Pin */}
      {activePin && popupPosition && !isPlacingPin && (
        <div
          style={popupPosition.style}
          onClick={(e) => e.stopPropagation()}
          className="pin-comment-popup z-40 bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-xl p-3.5 text-xs text-foreground animate-in fade-in zoom-in-95 duration-150 select-text max-h-[85vh] overflow-y-auto"
        >
          {/* Meta Header */}
          <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-border/60">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-medium text-foreground flex items-center gap-1.5 text-xs truncate">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{activePin.author || 'Anonymous'}</span>
              </span>
              <Badge variant="secondary" className="font-mono text-[11px]">
                Page {activePin.pageNumber}
              </Badge>
              {activePin.sectionRef && (
                <Badge variant="outline" className="font-mono text-[11px] border-primary/40 text-primary">
                  Sec {activePin.sectionRef}
                </Badge>
              )}
              {activePin.timestamp && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                  <Clock className="w-3 h-3 text-muted-foreground/70" />
                  <span>{formatNoteDateTime(activePin.timestamp)}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {activePin.status && (
                <Badge
                  variant={
                    activePin.status === 'resolved'
                      ? 'default'
                      : activePin.status === 'reviewed'
                      ? 'secondary'
                      : 'outline'
                  }
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-mono font-medium",
                    activePin.status === 'resolved' &&
                      "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                    activePin.status === 'reviewed' &&
                      "bg-blue-500/10 text-blue-400 border-blue-500/30",
                    activePin.status === 'open' &&
                      "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  )}
                >
                  {activePin.status}
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => handleSetActivePinId(null)}
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-full"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
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
                <div className="flex items-center gap-1 shrink-0 -mt-0.5 -mr-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEditPin) {
                        const pin = activePin;
                        handleSetActivePinId(null);
                        onEditPin(pin);
                      } else {
                        setEditCommentText(activePin.comment || '');
                        setIsEditingComment(true);
                      }
                    }}
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Edit note"
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDeletePin) {
                        const pin = activePin;
                        handleSetActivePinId(null);
                        onDeletePin(pin);
                      }
                    }}
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                    title="Delete note"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Photo Previews if any - generous sizing so operators can see details */}
          {activePin.photoUrls && activePin.photoUrls.length > 0 && (
            <div className="mb-2.5 space-y-1.5">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
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
                    className="relative rounded-lg overflow-hidden border border-border/80 hover:border-primary transition-all cursor-pointer bg-muted/20 shrink-0 max-h-52 max-w-[280px] group"
                    title="Click to view full photo"
                  >
                    <img
                      src={url}
                      alt={`Photo ${idx + 1}`}
                      className="max-h-48 w-auto object-contain rounded-md group-hover:scale-102 transition-transform"
                    />
                  </button>
                ))}
              </div>
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
                handleSetActivePinId(null);
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
            transform: 'translate(-50%, -50%) scale(1.2)',
            opacity: 0.7,
            cursor: isDraggingPin ? 'grabbing' : 'grab',
          }}
          onMouseDown={handleMouseDownOnPin}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
            if (e.touches.length === 1) {
              placeCandidateAt(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          className="z-50 select-none animate-in fade-in zoom-in-75 duration-150 pointer-events-auto"
        >
          {/* Coordinates Tooltip Pill */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/85 text-white font-mono text-[10px] px-2 py-0.5 rounded shadow-lg border border-white/10 pointer-events-none">
            Page {candidatePin.pageNumber} · {candidatePin.x}%, {candidatePin.y}%
          </div>

          {/* Simple Transparent Red Circle with subtle pulse */}
          <div className="relative flex items-center justify-center">
            <span className="absolute w-12 h-12 rounded-full bg-red-500 animate-ping opacity-40 pointer-events-none" />
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-500 border border-red-600 shadow-md ring-2 ring-red-400/60" />
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
              <span>Click or drag pin to adjust, then tap <strong>Continue</strong></span>
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
