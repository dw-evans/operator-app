import type { FC } from 'react';
import { PDFViewer } from '@embedpdf/react-pdf-viewer';

export interface PdfiumViewerProps {
  url: string;
}

export const PdfiumViewer: FC<PdfiumViewerProps> = ({ url }) => {
  // Guarantee absolute URLs based on current host/protocol (prevents worker/blob resolution delays)
  const absoluteWasmUrl = new URL('/pdfium.wasm', window.location.origin).href;
  const absoluteDocUrl = new URL(url, window.location.origin).href;

  return (
    <div className="w-full h-full relative overflow-hidden bg-background">
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
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default PdfiumViewer;
