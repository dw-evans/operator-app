import { useRef, useState, useEffect } from 'react';
import type { FC } from 'react';
import { Maximize2, Minimize2, ExternalLink, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';

interface PdfViewerProps {
  url: string;
  title: string;
}

export const PdfViewer: FC<PdfViewerProps> = ({ url, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentBlobUrl: string | null = null;

    setIsLoading(true);
    setErrorMessage(null);

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load manual (HTTP ${res.status})`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          throw new Error('Received HTML instead of PDF document');
        }

        const rawBlob = await res.blob();
        // Check magic bytes to guarantee valid PDF binary
        const header = await rawBlob.slice(0, 5).text();
        if (!header.startsWith('%PDF')) {
          throw new Error('Document file is not a valid PDF binary');
        }

        const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' });
        if (active) {
          currentBlobUrl = URL.createObjectURL(pdfBlob);
          setBlobUrl(currentBlobUrl);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('PDF fetch error:', err);
          setErrorMessage(err.message || 'Failed to display PDF');
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [url, reloadKey]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
        })
        .catch((err) => {
          console.warn('Fullscreen request failed:', err);
        });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-sm ${
        isFullscreen ? 'h-screen w-screen p-0 m-0 fixed inset-0 z-50' : 'h-[75vh] md:h-[82vh]'
      }`}
    >
      {/* Viewer Toolbar */}
      <div className="bg-zinc-900 px-3.5 py-2 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2 truncate">
          <span className="text-xs font-medium text-zinc-200 truncate max-w-xs md:max-w-md">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setReloadKey((prev) => prev + 1)}
            title="Reload PDF"
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <a
            href={blobUrl || url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new window"
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors inline-flex items-center"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'View Fullscreen'}
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-zinc-100" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* PDF View Container */}
      <div className="flex-1 w-full h-full relative bg-zinc-950 flex items-center justify-center">
        {isLoading && (
          <div className="flex flex-col items-center gap-2 text-zinc-400 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            <span>Loading manual...</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-6 text-center max-w-md">
            <AlertCircle className="w-7 h-7 text-rose-500 mx-auto mb-2" />
            <h4 className="text-sm font-medium text-zinc-200 mb-1">
              Unable to load manual
            </h4>
            <p className="text-xs text-zinc-400 mb-4">{errorMessage}</p>
            <button
              onClick={() => setReloadKey((prev) => prev + 1)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 text-xs rounded-md border border-zinc-700 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !errorMessage && blobUrl && (
          <object
            data={`${blobUrl}#toolbar=1&navpanes=0`}
            type="application/pdf"
            className="w-full h-full border-0"
          >
            <iframe
              src={`${blobUrl}#toolbar=1&navpanes=0`}
              title={title}
              className="w-full h-full border-0"
            />
          </object>
        )}
      </div>
    </div>
  );
};
