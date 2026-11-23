import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { CameraOff, Flashlight, FlashlightOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Configure zxing-wasm to load its bundled local WASM file (100% offline LAN safe)
prepareZXingModule({
  overrides: {
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) return zxingReaderWasmUrl;
      return path;
    },
  },
});

interface CameraScannerProps {
  /** Whether the scanner loop should actively decode frames. */
  isActive: boolean;
  /** Label displayed on the camera overlay (e.g. "Scanning #1" or "Ready to finish"). */
  statusLabel: string;
  /** Called whenever a Data Matrix or Code 128 barcode is decoded (raw string). */
  onDetected: (rawText: string) => void;
}

const CAPTURE_COOLDOWN_MS = 650;
const DECODE_INTERVAL_MS = 120;

export const CameraScanner: FC<CameraScannerProps> = ({
  isActive,
  statusLabel,
  onDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectedRef = useRef(onDetected);
  const isActiveRef = useRef(isActive);
  const lastCaptureTimeRef = useRef<number>(0);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);

  onDetectedRef.current = onDetected;
  isActiveRef.current = isActive;

  // Start rear camera stream on mount and clean up on unmount
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      setIsStarting(true);
      setCameraError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Camera API unavailable. Ensure the app is opened over HTTPS and camera permissions are allowed.'
        );
        setIsStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }

        // Check torch & continuous autofocus capabilities
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as Record<string, any>;
          if (caps.torch) {
            setTorchSupported(true);
          }
          if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            track
              .applyConstraints({
                advanced: [{ focusMode: 'continuous' } as any],
              })
              .catch(() => {});
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setCameraError(
            err?.message || 'Unable to access camera. Check browser permissions.'
          );
        }
      } finally {
        if (!cancelled) setIsStarting(false);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Periodic WASM decode loop on the central aiming reticle
  useEffect(() => {
    let running = true;
    let timerId: number | null = null;

    const tick = async () => {
      if (!running) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (
        isActiveRef.current &&
        video &&
        canvas &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        Date.now() - lastCaptureTimeRef.current >= CAPTURE_COOLDOWN_MS
      ) {
        try {
          // Crop central 65% region around the aiming reticle for fast, accurate decoding
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const cropW = Math.round(vw * 0.65);
          const cropH = Math.round(vh * 0.65);
          const sx = Math.round((vw - cropW) / 2);
          const sy = Math.round((vh - cropH) / 2);

          if (canvas.width !== cropW || canvas.height !== cropH) {
            canvas.width = cropW;
            canvas.height = cropH;
          }

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
            const imageData = ctx.getImageData(0, 0, cropW, cropH);

            const results = await readBarcodes(imageData, {
              formats: ['DataMatrix', 'Code128'],
              tryHarder: true,
              tryRotate: true,
              tryInvert: true,
              maxNumberOfSymbols: 1,
            });

            if (running && isActiveRef.current && results.length > 0) {
              const rawText = results[0].text;
              if (rawText) {
                lastCaptureTimeRef.current = Date.now();
                setFlashSuccess(true);
                setTimeout(() => setFlashSuccess(false), 320);
                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                  try {
                    navigator.vibrate(60);
                  } catch {
                    // ignore vibration errors
                  }
                }
                onDetectedRef.current(rawText);
              }
            }
          }
        } catch {
          // Ignore individual frame decode errors
        }
      }

      if (running) {
        timerId = window.setTimeout(tick, DECODE_INTERVAL_MS);
      }
    };

    timerId = window.setTimeout(tick, DECODE_INTERVAL_MS);
    return () => {
      running = false;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as any],
      });
      setTorchOn(next);
    } catch {
      // ignore if unsupported
    }
  };

  return (
    <div className="relative w-full h-full min-h-[260px] rounded-xl overflow-hidden bg-black border border-border flex items-center justify-center">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Centered Aiming Reticle */}
      {!cameraError && !isStarting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              'w-52 h-52 sm:w-64 sm:h-64 rounded-2xl border-2 transition-all duration-150',
              flashSuccess
                ? 'border-emerald-400 bg-emerald-400/15 scale-105'
                : isActive
                  ? 'border-white/75 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]'
                  : 'border-white/30 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]'
            )}
          />
        </div>
      )}

      {/* Top Overlay: Status Pill + Torch */}
      <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2 z-10">
        <div className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-xs border border-white/15 text-white text-xs font-medium">
          {statusLabel}
        </div>

        {torchSupported && (
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={toggleTorch}
            className="h-8 w-8 rounded-full bg-black/75 hover:bg-black/90 text-white border border-white/15 cursor-pointer"
            title={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
          >
            {torchOn ? (
              <FlashlightOff className="w-4 h-4" />
            ) : (
              <Flashlight className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>

      {/* Loading State */}
      {isStarting && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 text-white text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span>Starting camera...</span>
        </div>
      )}

      {/* Camera Error State */}
      {cameraError && (
        <div className="absolute inset-0 bg-card/95 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <CameraOff className="w-8 h-8 text-muted-foreground" />
          <div className="text-sm font-medium text-foreground">Camera Unavailable</div>
          <p className="text-xs text-muted-foreground max-w-sm">{cameraError}</p>
        </div>
      )}
    </div>
  );
};
