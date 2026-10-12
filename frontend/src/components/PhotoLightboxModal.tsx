import { useState, useRef, useEffect, useCallback } from 'react';
import type { FC, PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent, WheelEvent as ReactWheelEvent } from 'react';
import { ArrowLeft, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PhotoLightboxModalProps {
  photoUrl: string | null;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.5;

export const PhotoLightboxModal: FC<PhotoLightboxModalProps> = ({ photoUrl, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // References for drag and pinch tracking
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPinchDistRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset transform when photo changes or modal closes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
  }, [photoUrl]);

  // Keyboard navigation: Escape to close, + / - to zoom, 0 to reset
  useEffect(() => {
    if (!photoUrl) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setScale((prev) => Math.min(MAX_SCALE, Math.round((prev + SCALE_STEP) * 10) / 10));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setScale((prev) => {
          const next = Math.max(MIN_SCALE, Math.round((prev - SCALE_STEP) * 10) / 10);
          if (next === 1) setPosition({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === '0') {
        e.preventDefault();
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photoUrl, onClose]);

  // Adjust zoom level helper
  const handleZoom = useCallback((direction: 'in' | 'out') => {
    setScale((prev) => {
      const next = direction === 'in'
        ? Math.min(MAX_SCALE, Math.round((prev + SCALE_STEP) * 10) / 10)
        : Math.max(MIN_SCALE, Math.round((prev - SCALE_STEP) * 10) / 10);
      if (next === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Double click / Double tap toggle: 1x <-> 2.5x
  const handleDoubleAction = useCallback(() => {
    if (scale > 1) {
      handleReset();
    } else {
      setScale(2.5);
    }
  }, [scale, handleReset]);

  // Mouse wheel zoom
  const handleWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    const zoomFactor = -e.deltaY * 0.0015;
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + zoomFactor));
      if (next <= 1.05) {
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      return next;
    });
  };

  // Pointer dragging (mouse or single finger touch)
  const handlePointerDown = (e: ReactPointerEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    posStartRef.current = { ...position };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!isDragging || scale <= 1) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    // Bounds limit based on viewport and scale
    const maxBoundX = (window.innerWidth * (scale - 1)) / 2;
    const maxBoundY = (window.innerHeight * (scale - 1)) / 2;

    const targetX = Math.max(-maxBoundX, Math.min(maxBoundX, posStartRef.current.x + deltaX));
    const targetY = Math.max(-maxBoundY, Math.min(maxBoundY, posStartRef.current.y + deltaY));

    setPosition({ x: targetX, y: targetY });
  };

  const handlePointerUp = (e: ReactPointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore pointer release error
      }
    }
  };

  // Two-finger pinch-to-zoom on touch screens
  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDistRef.current = dist;
      initialScaleRef.current = scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        handleDoubleAction();
      }
      lastTapRef.current = now;
    }
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / initialPinchDistRef.current;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, initialScaleRef.current * ratio));
      setScale(nextScale);
      if (nextScale === 1) {
        setPosition({ x: 0, y: 0 });
      }
    }
  };

  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (e.touches.length < 2) {
      initialPinchDistRef.current = null;
    }
  };

  if (!photoUrl) return null;

  return (
    <div
      ref={containerRef}
      onClick={() => {
        if (scale === 1) onClose();
      }}
      onWheel={handleWheel}
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none touch-none overflow-hidden animate-in fade-in duration-150"
    >
      {/* Prominent Back Button in Top-Left */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 left-4 z-[110] flex items-center gap-2 bg-background/85 hover:bg-background text-foreground backdrop-blur-md shadow-xl border border-border cursor-pointer font-medium px-3.5 py-2 h-9 rounded-lg"
        title="Back (Esc)"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </Button>

      {/* Close Button in Top-Right */}
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-[110] bg-background/85 hover:bg-background text-foreground backdrop-blur-md shadow-xl border border-border cursor-pointer h-9 w-9 rounded-lg"
        title="Close (Esc)"
      >
        <X className="w-4 h-4" />
      </Button>

      {/* Floating Zoom Controls Pill in Bottom-Center */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/90 hover:bg-background/95 backdrop-blur-md border border-border shadow-2xl text-foreground text-xs"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => handleZoom('out')}
          disabled={scale <= MIN_SCALE}
          className="h-7 w-7 rounded-full text-foreground hover:bg-muted cursor-pointer disabled:opacity-40"
          title="Zoom out (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>

        <span
          onClick={handleReset}
          className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded cursor-pointer hover:bg-muted/60 min-w-[3.5rem] text-center"
          title="Click to reset zoom"
        >
          {Math.round(scale * 100)}%
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => handleZoom('in')}
          disabled={scale >= MAX_SCALE}
          className="h-7 w-7 rounded-full text-foreground hover:bg-muted cursor-pointer disabled:opacity-40"
          title="Zoom in (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>

        {scale > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleReset}
            className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer ml-0.5"
            title="Reset to 100% (0)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Zoomable & Pannable Image Element */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={(e) => {
          e.stopPropagation();
          handleDoubleAction();
        }}
      >
        <img
          src={photoUrl}
          alt="Preview"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 120ms ease-out',
            touchAction: 'none',
          }}
          className={cn(
            "max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain border border-border/80 will-change-transform",
            scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
          )}
        />
      </div>
    </div>
  );
};
