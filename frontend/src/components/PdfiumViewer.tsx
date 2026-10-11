import { useCallback, useRef, useEffect } from 'react';
import type { FC } from 'react';
import { PDFViewer } from '@embedpdf/react-pdf-viewer';
import type { PluginRegistry } from '@embedpdf/snippet';
import { MapPin, X } from 'lucide-react';
import type { PdfPin } from '../types';
import { getPageContainers, renderPinsOnShadow } from './pdfPinUtils';

export interface PdfiumViewerProps {
  url: string;
  onPageChange?: (pageNumber: number) => void;
  pins?: PdfPin[];
  isPlacingPin?: boolean;
  onPinPlaced?: (pin: { pageNumber: number; x: number; y: number }) => void;
  onCancelPlacement?: () => void;
  onPinClick?: (pin: PdfPin) => void;
}

export const PdfiumViewer: FC<PdfiumViewerProps> = ({
  url,
  onPageChange,
  pins = [],
  isPlacingPin = false,
  onPinPlaced,
  onCancelPlacement,
  onPinClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Guarantee absolute URLs based on current host/protocol (prevents worker/blob resolution delays)
  const absoluteWasmUrl = new URL('/pdfium.wasm', window.location.origin).href;
  const absoluteDocUrl = new URL(url, window.location.origin).href;

  // Sync pins onto EmbedPDF shadow DOM whenever pins or pages change
  const syncPins = useCallback(() => {
    if (!containerRef.current) return;
    const embedEl = containerRef.current.querySelector('embedpdf-container');
    const shadow = embedEl?.shadowRoot;
    if (!shadow) return;

    renderPinsOnShadow(shadow, pins, onPinClick);
  }, [pins, onPinClick]);

  useEffect(() => {
    syncPins();

    // Set up MutationObserver to re-render pins if EmbedPDF tiles or re-renders pages on zoom/scroll
    const embedEl = containerRef.current?.querySelector('embedpdf-container');
    const shadow = embedEl?.shadowRoot;
    if (!shadow) return;

    const observer = new MutationObserver(() => {
      syncPins();
    });

    observer.observe(shadow, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [syncPins, url]);

  const handleReady = useCallback(
    (registry: PluginRegistry) => {
      // Sync initial pins once registry is ready
      setTimeout(syncPins, 50);

      if (!onPageChange) return;

      const scrollPlugin = (registry.getPlugin?.('scroll') ||
        registry.getCapabilityProvider?.('scroll')) as any;

      if (!scrollPlugin) return;

      const capability = scrollPlugin.buildCapability ? scrollPlugin.buildCapability() : scrollPlugin;

      // Read current initial page
      const syncCurrentPage = () => {
        const page = capability.getCurrentPage?.() ?? scrollPlugin.getCurrentPage?.();
        if (typeof page === 'number' && page > 0) {
          onPageChange(page);
        }
      };

      syncCurrentPage();

      // Subscribe to page change events
      if (capability.onPageChange) {
        capability.onPageChange((event: { pageNumber?: number }) => {
          if (typeof event?.pageNumber === 'number' && event.pageNumber > 0) {
            onPageChange(event.pageNumber);
          }
        });
      }

      // Also listen to onScroll for real-time page detection while scrolling
      if (capability.onScroll) {
        capability.onScroll(() => {
          syncCurrentPage();
          syncPins();
        });
      }

      // Also subscribe to core store updates
      const store = registry.getStore?.();
      if (store && typeof store.subscribe === 'function') {
        store.subscribe(() => {
          syncCurrentPage();
        });
      }
    },
    [onPageChange, syncPins]
  );

  // Handle tap / click on the placement overlay to drop a pin
  const handlePlacementClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onPinPlaced || !containerRef.current) return;
    const embedEl = containerRef.current.querySelector('embedpdf-container');
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

    // 2. Proximity check (if tapped near page margin/border)
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
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-background">
      <PDFViewer
        key={url}
        config={{
          src: absoluteDocUrl,
          wasmUrl: absoluteWasmUrl,
          // Disable external CDN fonts and font fallbacks to guarantee 0s offline LAN startup
          fonts: { ui: null },
          fontFallback: null,
          // Run direct engine without worker blob pool overhead
          worker: false,
          theme: { preference: 'dark' },
        }}
        onReady={handleReady}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Pin Placement Mode Interactive Overlay */}
      {isPlacingPin && (
        <div
          onClick={handlePlacementClick}
          className="absolute inset-0 z-40 cursor-crosshair bg-primary/10 transition-colors select-none"
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
    </div>
  );
};

export default PdfiumViewer;
