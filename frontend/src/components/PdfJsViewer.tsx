import { useRef, useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  AlertCircle,
  Loader2,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Configure worker URL for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfJsViewerProps {
  url: string;
  title: string;
  slotId: number;
  initialPage?: number;
  onPageChange?: (pageNumber: number) => void;
  onOpenNotes: () => void;
  notesCount?: number;
}

export const PdfJsViewer: FC<PdfJsViewerProps> = ({
  url,
  title,
  slotId,
  initialPage = 1,
  onPageChange,
  onOpenNotes,
  notesCount = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const renderTimeoutRef = useRef<number | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);

  // Zoom state
  const [fitMode, setFitMode] = useState<'width' | 'page' | 'custom'>('width');
  const [customScale, setCustomScale] = useState(1.0);
  const [renderedScale, setRenderedScale] = useState(1.0);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Touch pinch tracking
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1.0);

  // Load PDF Document
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);

    const loadingTask = pdfjsLib.getDocument({
      url,
      cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
    });

    loadingTask.promise
      .then((doc) => {
        if (!active) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage((prev) => Math.min(Math.max(1, prev), doc.numPages));
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load PDF via pdfjs-dist:', err);
        setErrorMessage(err.message || 'Failed to load PDF document');
        setIsLoading(false);
      });

    return () => {
      active = false;
      loadingTask.destroy();
    };
  }, [url, reloadKey]);

  // Sync active page changes to parent
  useEffect(() => {
    if (onPageChange && totalPages > 0) {
      onPageChange(currentPage);
    }
  }, [currentPage, totalPages, onPageChange]);

  // Compute target scale given current container & page dimensions
  const computeTargetScale = useCallback(
    (page: pdfjsLib.PDFPageProxy): number => {
      const container = scrollContainerRef.current || containerRef.current;
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      if (!container) return customScale || 1.0;

      const availableWidth = Math.max(280, container.clientWidth - 32);
      const availableHeight = Math.max(300, container.clientHeight - 48);

      if (fitMode === 'width') {
        return Math.max(0.25, parseFloat((availableWidth / unscaledViewport.width).toFixed(2)));
      } else if (fitMode === 'page') {
        const scaleW = availableWidth / unscaledViewport.width;
        const scaleH = availableHeight / unscaledViewport.height;
        return Math.max(0.25, parseFloat((Math.min(scaleW, scaleH)).toFixed(2)));
      } else {
        return customScale;
      }
    },
    [fitMode, customScale]
  );

  // Render Page to Canvas
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const targetScale = computeTargetScale(page);
        setRenderedScale(targetScale);

        const viewport = page.getViewport({ scale: targetScale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5); // Cap DPR at 2.5 for memory safety

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport,
          canvas,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;

        await task.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Page render error:', err);
        }
      }
    },
    [pdfDoc, computeTargetScale]
  );

  // Debounced render trigger
  useEffect(() => {
    if (!pdfDoc || currentPage <= 0) return;

    if (renderTimeoutRef.current) {
      window.clearTimeout(renderTimeoutRef.current);
    }

    renderTimeoutRef.current = window.setTimeout(() => {
      renderPage(currentPage);
    }, 60);

    return () => {
      if (renderTimeoutRef.current) {
        window.clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [pdfDoc, currentPage, fitMode, customScale, renderPage]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      if (fitMode !== 'custom') {
        renderPage(currentPage);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitMode, currentPage, renderPage]);

  // Mouse wheel with Ctrl / Trackpad pinch to zoom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        setFitMode('custom');
        setCustomScale((prev) => {
          const base = fitMode === 'custom' ? prev : renderedScale;
          const next = Math.min(5.0, Math.max(0.3, parseFloat((base * factor).toFixed(2))));
          return next;
        });
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [fitMode, renderedScale]);

  // Touch Pinch-to-zoom handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartScaleRef.current = renderedScale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchStartDistRef.current;
      const next = Math.min(5.0, Math.max(0.3, parseFloat((touchStartScaleRef.current * factor).toFixed(2))));
      setFitMode('custom');
      setCustomScale(next);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  // Zoom Button Controls
  const handleZoomIn = () => {
    const current = renderedScale || 1.0;
    const next = Math.min(5.0, parseFloat((current * 1.25).toFixed(2)));
    setCustomScale(next);
    setFitMode('custom');
  };

  const handleZoomOut = () => {
    const current = renderedScale || 1.0;
    const next = Math.max(0.3, parseFloat((current / 1.25).toFixed(2)));
    setCustomScale(next);
    setFitMode('custom');
  };

  const handleFitWidth = () => {
    setFitMode('width');
  };

  const handleFitPage = () => {
    setFitMode('page');
  };

  const handleResetZoom = () => {
    setFitMode('custom');
    setCustomScale(1.0);
  };

  // Double Click toggles zoom
  const handleDoubleClick = () => {
    if (renderedScale > 1.2) {
      handleFitWidth();
    } else {
      setCustomScale(1.75);
      setFitMode('custom');
    }
  };

  const goToPrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.warn);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.warn);
    }
  };

  const zoomPercentDisplay = Math.round(renderedScale * 100);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col w-full bg-background text-foreground relative select-none',
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen' : 'h-[calc(100vh-3.5rem)]'
      )}
    >
      {/* Top Floating Control Toolbar (Solid background, no blur) */}
      <div className="z-30 px-2 sm:px-3 py-2 bg-card border-b border-border flex items-center justify-between gap-1.5 sm:gap-2 shadow-sm shrink-0">
        {/* Left: Document Info */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Badge variant="outline" className="font-mono text-xs shrink-0">
            Slot {slotId}
          </Badge>
          <span className="text-xs font-semibold text-card-foreground truncate max-w-[120px] sm:max-w-xs md:max-w-md">
            {title}
          </span>
        </div>

        {/* Center: Page Navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-xs"
            onClick={goToPrevPage}
            disabled={currentPage <= 1 || isLoading}
            title="Previous Page"
            className="h-7 w-7"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 text-xs font-mono font-medium text-foreground px-2 py-0.5 rounded bg-muted/60">
            <span>{currentPage}</span>
            <span className="text-muted-foreground">/</span>
            <span>{totalPages || '-'}</span>
          </div>

          <Button
            variant="outline"
            size="icon-xs"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages || isLoading}
            title="Next Page"
            className="h-7 w-7"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Right: Interactive Zoom & Notes Controls (Visible on ALL devices) */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Zoom In / Out Controls */}
          <div className="flex items-center gap-0.5 sm:gap-1 bg-muted/50 rounded-lg p-0.5 border border-border">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleZoomOut}
              disabled={isLoading || renderedScale <= 0.3}
              title="Zoom Out (Ctrl -)"
              className="h-6 w-6 sm:h-7 sm:w-7"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>

            {/* Current Zoom Percentage display (clickable to reset to 100%) */}
            <button
              onClick={handleResetZoom}
              title="Click to reset zoom to 100%"
              className="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-foreground hover:bg-muted rounded transition-colors cursor-pointer min-w-[42px] text-center"
            >
              {zoomPercentDisplay}%
            </button>

            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleZoomIn}
              disabled={isLoading || renderedScale >= 5.0}
              title="Zoom In (Ctrl +)"
              className="h-6 w-6 sm:h-7 sm:w-7"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Quick Fit Mode Buttons (available on sm: screens and up) */}
          <div className="hidden md:flex items-center gap-1 border-l border-border pl-1.5">
            <Button
              variant={fitMode === 'width' ? 'secondary' : 'ghost'}
              size="xs"
              onClick={handleFitWidth}
              disabled={isLoading}
              title="Fit to Width"
              className="text-[11px] px-2 h-7"
            >
              Fit Width
            </Button>
            <Button
              variant={fitMode === 'page' ? 'secondary' : 'ghost'}
              size="xs"
              onClick={handleFitPage}
              disabled={isLoading}
              title="Fit Whole Page"
              className="text-[11px] px-2 h-7"
            >
              Fit Page
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleResetZoom}
              disabled={isLoading}
              title="Reset Zoom (100%)"
              className="h-7 w-7"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Fullscreen Button */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="h-7 w-7 hidden lg:inline-flex"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>

          {/* Notes Button in Toolbar */}
          <Button
            variant="default"
            size="sm"
            onClick={onOpenNotes}
            className="h-7 px-2.5 gap-1.5 text-xs font-medium cursor-pointer shadow-sm"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Notes</span>
            {notesCount > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px]">
                {notesCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Main PDF Scroll & View Area with Pinch-to-Zoom */}
      <div
        ref={scrollContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 w-full overflow-auto bg-muted/20 relative"
      >
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-muted-foreground text-xs z-10 bg-background/50">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <span>Loading PDF manual...</span>
          </div>
        )}

        {errorMessage && (
          <div className="absolute inset-0 flex items-center justify-center p-4 z-10">
            <div className="p-6 text-center max-w-md bg-card border border-border rounded-xl shadow-lg">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-card-foreground mb-1">
                Unable to load manual
              </h4>
              <p className="text-xs text-muted-foreground mb-4">{errorMessage}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReloadKey((prev) => prev + 1)}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </Button>
            </div>
          </div>
        )}

        {/* Canvas centering & overflow container */}
        <div className="min-w-full min-h-full flex p-3 sm:p-6">
          <div
            className="m-auto relative inline-block transition-transform duration-75"
            onDoubleClick={handleDoubleClick}
            title="Double-click to zoom in / fit"
          >
            <canvas
              ref={canvasRef}
              className={cn(
                'shadow-2xl rounded-md bg-white border border-border block transition-opacity duration-150',
                isLoading ? 'opacity-0' : 'opacity-100'
              )}
            />
          </div>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Notes */}
      <div className="absolute bottom-4 right-4 z-30">
        <Button
          onClick={onOpenNotes}
          className="h-11 px-4 rounded-full shadow-xl flex items-center gap-2 font-medium text-xs sm:text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-transform active:scale-95 cursor-pointer"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Notes & Feedback</span>
          {notesCount > 0 && (
            <Badge variant="secondary" className="rounded-full px-1.5 text-[11px] font-bold">
              {notesCount}
            </Badge>
          )}
        </Button>
      </div>
    </div>
  );
};
