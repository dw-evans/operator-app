import type { FC } from 'react';
import { PDFViewer } from '@embedpdf/react-pdf-viewer';

export interface PdfiumViewerProps {
  url: string;
}

export const PdfiumViewer: FC<PdfiumViewerProps> = ({ url }) => {
  return (
    <div className="w-full h-full relative overflow-hidden bg-background">
      <PDFViewer
        key={url}
        config={{
          src: url,
          wasmUrl: '/pdfium.wasm',
          theme: { preference: 'dark' },
        }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default PdfiumViewer;
