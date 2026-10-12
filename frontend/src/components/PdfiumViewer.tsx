import { useState, useCallback, useEffect, useRef } from 'react';
import type { FC } from 'react';
import { PDFViewer } from '@embedpdf/react-pdf-viewer';
import type { PluginRegistry } from '@embedpdf/snippet';
import type { PdfPin } from '../types';
import { PdfPinOverlay, getPageContainers } from './PdfPinOverlay';
import { getPdfBlob } from '../services/db';

export interface PdfiumViewerProps {
  url: string;
  onPageChange?: (pageNumber: number) => void;
  targetPage?: number | { pageNumber: number; timestamp?: number; seq?: number } | null;
  selectedPinId?: string | null;
  pins?: PdfPin[];
  isPlacingPin?: boolean;
  initialPin?: { pageNumber: number; x: number; y: number } | null;
  onPinPlaced?: (pin: { pageNumber: number; x: number; y: number }) => void;
  onCancelPlacement?: () => void;
  onPinClick?: (pin: PdfPin) => void;
  onOpenDrawer?: (pin: PdfPin) => void;
  onViewPhoto?: (url: string) => void;
  onCommentUpdated?: (pinId: string, newComment: string) => void;
  onEditPin?: (pin: PdfPin) => void;
  onDeletePin?: (pin: PdfPin) => void;
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
  targetPage,
  selectedPinId,
  pins = [],
  isPlacingPin = false,
  initialPin,
  onPinPlaced,
  onCancelPlacement,
  onPinClick,
  onOpenDrawer,
  onViewPhoto,
  onCommentUpdated,
  onEditPin,
  onDeletePin,
}) => {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const scrollCapabilityRef = useRef<any>(null);
  const pendingPageRef = useRef<number | null>(null);

  // Guarantee absolute URLs based on current host/protocol (prevents worker/blob resolution delays)
  const absoluteWasmUrl = new URL('/pdfium.wasm', window.location.origin).href;
  const absoluteDocUrl = new URL(url, window.location.origin).href;

  const [docSrc, setDocSrc] = useState<string>(absoluteDocUrl);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isSubscribed = true;

    async function resolveDocSrc() {
      if (!navigator.onLine) {
        try {
          const blob = await getPdfBlob(url);
          if (blob && isSubscribed) {
            objectUrl = URL.createObjectURL(blob);
            setDocSrc(objectUrl);
            return;
          }
        } catch {
          // fallback
        }
      }
      if (isSubscribed) {
        setDocSrc(absoluteDocUrl);
      }
    }

    resolveDocSrc();

    return () => {
      isSubscribed = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, absoluteDocUrl]);

  const scrollToTargetPage = useCallback(
    (page: number) => {
      if (!page || page < 1) return;

      const capability = scrollCapabilityRef.current;
      if (capability?.scrollToPage) {
        try {
          capability.scrollToPage({ pageNumber: page, behavior: 'smooth' });
          return;
        } catch (err) {
          console.warn('capability.scrollToPage failed, attempting DOM fallback:', err);
        }
      } else {
        pendingPageRef.current = page;
      }

      // DOM fallback via ShadowRoot page containers
      if (containerEl) {
        const embedEl = containerEl.querySelector('embedpdf-container');
        const shadow = embedEl?.shadowRoot;
        if (shadow) {
          const pages = getPageContainers(shadow);
          const targetEl = pages[page - 1];
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    },
    [containerEl]
  );

  useEffect(() => {
    if (!targetPage) return;
    const pageNum = typeof targetPage === 'number' ? targetPage : targetPage.pageNumber;
    if (typeof pageNum === 'number' && pageNum > 0) {
      scrollToTargetPage(pageNum);
    }
  }, [targetPage, scrollToTargetPage]);

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

      const scrollPlugin = (registry.getPlugin?.('scroll') ||
        registry.getCapabilityProvider?.('scroll')) as any;

      if (!scrollPlugin) return;

      const capability = scrollPlugin.buildCapability ? scrollPlugin.buildCapability() : scrollPlugin;
      scrollCapabilityRef.current = capability;

      // Handle any pending scroll navigation queued before viewer was ready
      if (pendingPageRef.current) {
        const target = pendingPageRef.current;
        pendingPageRef.current = null;
        setTimeout(() => {
          scrollToTargetPage(target);
        }, 120);
      }

      if (onPageChange) {
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
      }
    },
    [onPageChange, scrollToTargetPage]
  );

  return (
    <div
      ref={setContainerEl}
      className="w-full h-full relative overflow-hidden bg-background"
    >
      <PDFViewer
        key={docSrc}
        config={{
          src: docSrc,
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
        selectedPinId={selectedPinId}
        isPlacingPin={isPlacingPin}
        initialPin={initialPin}
        onPinPlaced={onPinPlaced}
        onCancelPlacement={onCancelPlacement}
        onPinClick={onPinClick}
        onOpenDrawer={onOpenDrawer}
        onViewPhoto={onViewPhoto}
        onCommentUpdated={onCommentUpdated}
        onEditPin={onEditPin}
        onDeletePin={onDeletePin}
      />
    </div>
  );
};

export default PdfiumViewer;
