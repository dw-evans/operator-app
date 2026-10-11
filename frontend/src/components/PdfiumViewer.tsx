import { useState, useCallback } from 'react';
import type { FC } from 'react';
import { PDFViewer } from '@embedpdf/react-pdf-viewer';
import type { PluginRegistry } from '@embedpdf/snippet';
import type { PdfPin } from '../types';
import { PdfPinOverlay } from './PdfPinOverlay';

export interface PdfiumViewerProps {
  url: string;
  onPageChange?: (pageNumber: number) => void;
  pins?: PdfPin[];
  isPlacingPin?: boolean;
  initialPin?: { pageNumber: number; x: number; y: number } | null;
  onPinPlaced?: (pin: { pageNumber: number; x: number; y: number }) => void;
  onCancelPlacement?: () => void;
  onPinClick?: (pin: PdfPin) => void;
}

// Categories to disable in EmbedPDF to provide a pure, distraction-free reading experience
const DISABLED_CATEGORIES = [
  'annotation',
  'shape',
  'insert',
  'form',
  'redaction',
  'mode',
  'panel-comment',
  'document-print',
  'document-export',
];

export const PdfiumViewer: FC<PdfiumViewerProps> = ({
  url,
  onPageChange,
  pins = [],
  isPlacingPin = false,
  initialPin,
  onPinPlaced,
  onCancelPlacement,
  onPinClick,
}) => {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

  // Guarantee absolute URLs based on current host/protocol (prevents worker/blob resolution delays)
  const absoluteWasmUrl = new URL('/pdfium.wasm', window.location.origin).href;
  const absoluteDocUrl = new URL(url, window.location.origin).href;

  const handleReady = useCallback(
    (registry: PluginRegistry) => {
      // Synchronize disabled categories on commands and ui plugins
      try {
        const commandsPlugin = registry.getPlugin?.('commands') as any;
        const commands = commandsPlugin?.provides ? commandsPlugin.provides() : commandsPlugin;
        if (commands?.setDisabledCategories) {
          commands.setDisabledCategories(DISABLED_CATEGORIES);
        }

        const uiPlugin = registry.getPlugin?.('ui') as any;
        const ui = uiPlugin?.provides ? uiPlugin.provides() : uiPlugin;
        if (ui?.setDisabledCategories) {
          ui.setDisabledCategories(DISABLED_CATEGORIES);
        }
      } catch (e) {
        console.warn('Could not sync disabled categories on plugins:', e);
      }

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
    [onPageChange]
  );

  return (
    <div
      ref={setContainerEl}
      className="w-full h-full relative overflow-hidden bg-background"
    >
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
          tabBar: 'never',
          disabledCategories: DISABLED_CATEGORIES,
        }}
        onReady={handleReady}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Reactive Pin Overlay & Placement Layer */}
      <PdfPinOverlay
        viewerContainer={containerEl}
        pins={pins}
        isPlacingPin={isPlacingPin}
        initialPin={initialPin}
        onPinPlaced={onPinPlaced}
        onCancelPlacement={onCancelPlacement}
        onPinClick={onPinClick}
      />
    </div>
  );
};

export default PdfiumViewer;
