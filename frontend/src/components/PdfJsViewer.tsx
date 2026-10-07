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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Configure the worker URL for pdfjs-dist
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [fitMode, setFitMode] = useState<'width' | 'page' | 'auto' | 'custom'>('auto');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Load PDF Document
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);

    const loadingTask = pdfjsLib.getDocument({
      url,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + pdfjsLib.version + '/cmaps/',
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

  // Render Page to Canvas
  const renderPage = useCallback(
    async (pageNum: number, currentScale: number) => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

      try {
        // Cancel any pending render task
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNum);
        const container = containerRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        // Calculate viewport according to fit mode if auto or width
        let renderScale = currentScale;
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        if (fitMode === 'width' && container) {
          const availableWidth = container.clientWidth - 32;
          if (availableWidth > 0) {
            renderScale = availableWidth / unscaledViewport.width;
          }
        } else if (fitMode === 'page' && container) {
          const availableWidth = container.clientWidth - 32;
          const availableHeight = container.clientHeight - 80;
          if (availableWidth > 0 && availableHeight > 0) {
            renderScale = Math.min(
              availableWidth / unscaledViewport.width,
              availableHeight / unscaledViewport.height
            );
          }
        } else if (fitMode === 'auto' && container) {
          const availableWidth = container.clientWidth - 32;
          const availableHeight = container.clientHeight - 80;
          if (availableWidth > 0 && availableHeight > 0) {
            const widthScale = availableWidth / unscaledViewport.width;
            const heightScale = availableHeight / unscaledViewport.height;
            // Best fit that doesn't exceed screen
            renderScale = Math.min(widthScale, heightScale);
          }
        }

        const viewport = page.getViewport({ scale: renderScale });
        const dpr = window.devicePixelRatio || 1;

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
    [pdfDoc, fitMode]
  );

  // Trigger render when page, scale, or fitMode changes
  useEffect(() => {
    if (pdfDoc && currentPage > 0) {
      renderPage(currentPage, scale);
    }
  }, [pdfDoc, currentPage, scale, fitMode, renderPage]);

  // Handle window resize to auto-adapt
  useEffect(() => {
    const handleResize = () => {
      if (fitMode !== 'custom') {
        renderPage(currentPage, scale);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitMode, currentPage, scale, renderPage]);

  const goToPrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const handleZoomIn = () => {
    setFitMode('custom');
    setScale((prev) => Math.min(3.0, prev + 0.2));
  };

  const handleZoomOut = () => {
    setFitMode('custom');
    setScale((prev) => Math.max(0.5, prev - 0.2));
  };

  const handleFitWidth = () => {
    setFitMode('width');
  };

  const handleFitPage = () => {
    setFitMode('auto');
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.warn);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.warn);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col w-full bg-background text-foreground relative select-none',
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen' : 'h-[calc(100vh-4.25rem)]'
      )}
    >
      {/* Top Floating Control Bar */}
      <div className="z-30 px-3 py-2 bg-card/90 backdrop-blur-md border-b border-border flex items-center justify-between gap-2 shadow-sm shrink-0">
        {/* Left: Document Info */}
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="font-mono text-xs shrink-0">
            Slot {slotId}
          </Badge>
          <span className="text-xs font-semibold text-card-foreground truncate max-w-[180px] sm:max-w-xs md:max-w-md">
            {title}
          </span>
        </div>

        {/* Center: Pagination Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
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

          <div className="flex items-center gap-1 text-xs font-mono font-medium text-foreground px-1.5 py-0.5 rounded bg-muted/60">
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

        {/* Right: Zoom & Notes trigger */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="hidden sm:flex items-center gap-1 border-r border-border pr-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleZoomOut}
              disabled={isLoading}
              title="Zoom Out"
              className="h-7 w-7"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleZoomIn}
              disabled={isLoading}
              title="Zoom In"
              className="h-7 w-7"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
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
              variant={fitMode === 'auto' ? 'secondary' : 'ghost'}
              size="xs"
              onClick={handleFitPage}
              disabled={isLoading}
              title="Fit Page"
              className="text-[11px] px-2 h-7"
            >
              Fit Page
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className="h-7 w-7 hidden md:inline-flex"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>

          {/* Quick Notes button in toolbar */}
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

      {/* Main PDF View Area */}
      <div className="flex-1 w-full overflow-auto bg-muted/20 flex items-center justify-center p-2 sm:p-4 relative">
        {isLoading && (
          <div className="flex flex-col items-center gap-2.5 text-muted-foreground text-xs py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span>Rendering PDF page with PDF.js...</span>
          </div>
        )}

        {errorMessage && (
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
        )}

        {/* PDF Canvas */}
        <canvas
          ref={canvasRef}
          className={cn(
            'shadow-xl rounded-md bg-white border border-border transition-opacity duration-150',
            isLoading ? 'opacity-0' : 'opacity-100'
          )}
        />
      </div>

      {/* Floating Action Button (FAB) for Notes (visible especially on mobile/tablet) */}
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
