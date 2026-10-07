import { useRef, useState } from 'react';
import type { FC } from 'react';
import { Maximize2, Minimize2, ExternalLink, RefreshCw } from 'lucide-react';

interface PdfViewerProps {
  url: string;
  title: string;
}

export const PdfViewer: FC<PdfViewerProps> = ({ url, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
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
      className={`flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg ${
        isFullscreen ? 'h-screen w-screen p-0 m-0 fixed inset-0 z-50' : 'h-[75vh] md:h-[82vh]'
      }`}
    >
      {/* Viewer Toolbar */}
      <div className="bg-slate-850 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 truncate">
          <span className="text-xs font-semibold text-slate-300 truncate max-w-xs md:max-w-md">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setReloadKey(prev => prev + 1)}
            title="Reload PDF"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new window"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'View Fullscreen'}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* PDF Iframe (Native browser renderer) */}
      <div className="flex-1 w-full h-full relative bg-slate-950">
        <iframe
          key={`${url}-${reloadKey}`}
          src={`${url}#toolbar=1&navpanes=0`}
          title={title}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
};
