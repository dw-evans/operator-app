import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SlotSelector } from './components/SlotSelector';
import { SlotViewerVariant } from './components/SlotViewerVariant';
import { AdminPortal } from './components/AdminPortal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Bug, Trash2, CheckCircle2 } from 'lucide-react';
import { fetchSlots } from './services/api';
import { getCachedManifest, saveCachedManifest, requestPersistentStorage } from './services/db';
import { pdfCacheManager } from './services/pdfCache';
import { syncManager } from './services/sync';
import type { SlotSummary } from './types';

export function App() {
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Synchronize UI state with current URL pathname
  const syncStateFromUrl = useCallback(() => {
    const pathname = window.location.pathname;
    if (pathname === '/admin') {
      setIsAdmin(true);
      setSelectedSlotId(null);
    } else {
      const match = pathname.match(/^\/slot\/(\d+)$/);
      if (match) {
        setIsAdmin(false);
        const slot = parseInt(match[1], 10);
        setSelectedSlotId(slot);
      } else {
        setIsAdmin(false);
        setSelectedSlotId(null);
      }
    }
  }, []);

  // Safe navigation that pushes URL into history so back button works
  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    syncStateFromUrl();
  };


  const loadSlots = async () => {
    setIsLoadingSlots(true);
    try {
      const data = await fetchSlots();
      setSlots(data);
      await saveCachedManifest(data);
      pdfCacheManager.cacheAllDocuments(data);
      syncManager.recordSuccessfulSync();
    } catch (err) {
      console.warn('Network fetch failed, attempting to read cached manifest from IndexedDB:', err);
      try {
        const cached = await getCachedManifest();
        if (cached && cached.length > 0) {
          setSlots(cached);
          pdfCacheManager.cacheAllDocuments(cached);
        }
      } catch (cacheErr) {
        console.error('Failed to read cached manifest:', cacheErr);
      }
    } finally {
      setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    // Request persistent client storage (CacheStorage and IndexedDB)
    requestPersistentStorage();

    // Listen for browser / hardware back and forward buttons
    window.addEventListener('popstate', syncStateFromUrl);

    // Initial state parse from current URL or restore from session
    const pathname = window.location.pathname;
    if (pathname === '/' || pathname === '') {
      const lastActive = sessionStorage.getItem('assembly_last_path');
      if (lastActive && lastActive !== '/') {
        window.history.replaceState(null, '', lastActive);
      }
    }
    syncStateFromUrl();
    loadSlots();

    return () => {
      window.removeEventListener('popstate', syncStateFromUrl);
    };
  }, [syncStateFromUrl]);

  // Keep session storage updated so PWA keeps location as long as app isn't shut down
  useEffect(() => {
    const currentPath = isAdmin
      ? '/admin'
      : selectedSlotId !== null
      ? `/slot/${selectedSlotId}`
      : '/';
    sessionStorage.setItem('assembly_last_path', currentPath);
  }, [isAdmin, selectedSlotId]);

  const [debugInfo, setDebugInfo] = useState({
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    isOnline: navigator.onLine,
    isPwa: window.matchMedia('(display-mode: standalone)').matches,
  });

  useEffect(() => {
    const handleResize = () => {
      setDebugInfo((prev) => ({
        ...prev,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      }));
    };
    const handleOnline = () => setDebugInfo((prev) => ({ ...prev, isOnline: true }));
    const handleOffline = () => setDebugInfo((prev) => ({ ...prev, isOnline: false }));

    window.addEventListener('resize', handleResize);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleClearCacheAndReload = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      } catch (err) {
        console.error('Failed to unregister SW:', err);
      }
    }
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      } catch (err) {
        console.error('Failed to delete caches:', err);
      }
    }
    window.location.reload();
  };

  const currentSlot = slots.find((s) => s.slot_id === selectedSlotId);
  const currentDoc = currentSlot?.live_document;

  const [isCurrentDocCached, setIsCurrentDocCached] = useState(false);

  useEffect(() => {
    return pdfCacheManager.subscribe(() => {
      if (currentDoc?.url) {
        setIsCurrentDocCached(pdfCacheManager.isDocumentCached(currentDoc.url));
      } else {
        setIsCurrentDocCached(false);
      }
    });
  }, [currentDoc?.url]);

  return (
    <div className="fixed inset-0 h-screen h-[100dvh] w-screen overflow-hidden bg-background text-foreground flex flex-col font-sans select-none">
      <Navbar
        currentSlotId={selectedSlotId}
        onBackToSlots={() => navigateTo('/')}
        isAdmin={isAdmin}
        onToggleAdmin={() => {
          if (isAdmin) {
            navigateTo('/');
          } else {
            navigateTo('/admin');
          }
        }}
      />

      {/* Debug Bar directly underneath Navbar */}
      <div className="shrink-0 bg-amber-950/25 border-b border-amber-500/25 px-3 py-1 flex items-center justify-between text-xs min-h-[1.875rem] gap-2 overflow-x-auto z-20">
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className="font-mono text-[10px] uppercase font-bold bg-amber-500/15 text-amber-400 border-amber-500/40 px-1.5 py-0 flex items-center gap-1"
          >
            <Bug className="w-2.5 h-2.5" />
            <span>debug</span>
          </Badge>
          <span className="font-mono text-[11px] text-muted-foreground hidden sm:inline">
            {debugInfo.viewport}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {debugInfo.isPwa ? 'Standalone PWA' : 'Browser'}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground hidden md:inline">
            {debugInfo.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            title="Reload web page inside PWA"
            className="h-5.5 px-2 text-[11px] font-medium gap-1 cursor-pointer bg-background/80 hover:bg-muted"
          >
            <RefreshCw className="w-3 h-3 text-primary" />
            <span>Refresh</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCacheAndReload}
            title="Unregister Service Worker, clear cache, and reload"
            className="h-5.5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive gap-1 cursor-pointer"
          >
            <Trash2 className="w-2.5 h-2.5" />
            <span className="hidden sm:inline">Clear SW</span>
          </Button>
        </div>
      </div>

      {/* Single-line Document Info Strip directly underneath Navbar */}
      {selectedSlotId !== null && (
        <div className="shrink-0 bg-muted/40 border-b border-border px-3 sm:px-4 py-1.5 flex items-center justify-between text-xs min-h-[2.125rem]">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="font-mono text-[11px] shrink-0 font-bold">
              Slot {selectedSlotId}
            </Badge>
            <span className="font-medium text-foreground truncate">
              {currentDoc?.title || currentDoc?.filename || `Manual Slot ${selectedSlotId}`}
            </span>
            {currentDoc && (
              <span className="text-muted-foreground text-[11px] shrink-0 font-mono">
                v{currentDoc.version}
              </span>
            )}
          </div>

          {currentDoc && (
            isCurrentDocCached ? (
              <Badge
                variant="outline"
                className="font-mono text-[10px] px-1.5 py-0 h-5 gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-medium shrink-0 ml-2"
                title="This manual PDF is stored locally for offline viewing"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>PDF Stored</span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="font-mono text-[10px] px-1.5 py-0 h-5 gap-1 border-muted-foreground/30 text-muted-foreground/80 shrink-0 ml-2 animate-pulse"
                title="Storing PDF manual offline..."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                <span>Storing PDF...</span>
              </Badge>
            )
          )}
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isAdmin ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AdminPortal
              onClose={() => navigateTo('/')}
              onSlotsUpdated={loadSlots}
            />
          </div>
        ) : selectedSlotId === null ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <SlotSelector
              slots={slots}
              onSelectSlot={(slotId) => {
                navigateTo(`/slot/${slotId}`);
              }}
              isLoading={isLoadingSlots}
            />
          </div>
        ) : (
          /* Active Variant: Mozilla PDF.js Fullscreen Viewer with Popover Notes Drawer */
          <SlotViewerVariant
            slotId={selectedSlotId}
            document={currentDoc || null}
            totalFeedbackCount={currentSlot?.total_feedback || 0}
            onFeedbackSubmitted={loadSlots}
          />

          /* [DISABLED FOR NOW] Legacy Dual-Panel Viewer Variant
          <div className="flex-1 p-3 md:p-4 grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            <div className="lg:col-span-7 flex flex-col">
              {currentDoc ? (
                <PdfViewer
                  url={currentDoc.url}
                  title={`Slot ${selectedSlotId}: ${currentDoc.title} (v${currentDoc.version})`}
                />
              ) : (
                <div className="h-[70vh] flex items-center justify-center bg-card border border-border rounded-xl text-muted-foreground text-sm">
                  No active manual found for Slot {selectedSlotId}.
                </div>
              )}
            </div>

            <div className="lg:col-span-5 flex flex-col space-y-3">
              <div className="flex bg-muted/60 p-1 rounded-xl border border-border">
                <button
                  onClick={() => setActiveTab('submit')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'submit'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Submit Note</span>
                </button>

                <button
                  onClick={() => setActiveTab('stream')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'stream'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Station Notes</span>
                </button>
              </div>

              <div className="flex-1">
                {activeTab === 'submit' ? (
                  <FeedbackEngine
                    slotId={selectedSlotId}
                    onFeedbackSubmitted={() => {
                      loadSlots();
                      setActiveTab('stream');
                    }}
                  />
                ) : (
                  <FeedbackStream slotId={selectedSlotId} />
                )}
              </div>
            </div>
          </div>
          */
        )}
      </main>
    </div>
  );
}

export default App;
