import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SlotSelector } from './components/SlotSelector';
import { SlotViewerVariant } from './components/SlotViewerVariant';
import { AdminPortal } from './components/AdminPortal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Bug, Trash2, CheckCircle2 } from 'lucide-react';
import {
  fetchSlots,
  syncAllSlotsFeedback,
  fetchSlotRevisionByVersion,
  adminReinstateRevision,
} from './services/api';
import { getCachedManifest, saveCachedManifest, requestPersistentStorage } from './services/db';
import { pdfCacheManager } from './services/pdfCache';
import { syncManager } from './services/sync';
import type { SlotSummary, DocumentRevision } from './types';

export function App() {
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [specificRevision, setSpecificRevision] = useState<DocumentRevision | null>(null);
  const [isLoadingRevision, setIsLoadingRevision] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Synchronize UI state with current URL pathname
  const syncStateFromUrl = useCallback(() => {
    const pathname = window.location.pathname;
    if (pathname === '/admin') {
      setIsAdmin(true);
      setSelectedSlotId(null);
      setSelectedVersion(null);
      setSpecificRevision(null);
    } else {
      // 1. Admin with specific version: /admin/manual/:slotId/v/:version or /admin/slot/:slotId/v/:version
      const adminVersionMatch = pathname.match(/^\/admin\/(?:manual|slot)\/(\d+)\/v\/(\d+)$/);
      if (adminVersionMatch) {
        setIsAdmin(true);
        setSelectedSlotId(parseInt(adminVersionMatch[1], 10));
        setSelectedVersion(parseInt(adminVersionMatch[2], 10));
        return;
      }

      // 2. Admin live: /admin/manual/:slotId or /admin/slot/:slotId
      const adminSlotMatch = pathname.match(/^\/admin\/(?:manual|slot)\/(\d+)$/);
      if (adminSlotMatch) {
        setIsAdmin(true);
        setSelectedSlotId(parseInt(adminSlotMatch[1], 10));
        setSelectedVersion(null);
        setSpecificRevision(null);
        return;
      }

      // 3. Operator with specific version: /manual/:slotId/v/:version or /slot/:slotId/v/:version
      const operatorVersionMatch = pathname.match(/^\/(?:manual|slot)\/(\d+)\/v\/(\d+)$/);
      if (operatorVersionMatch) {
        setIsAdmin(false);
        setSelectedSlotId(parseInt(operatorVersionMatch[1], 10));
        setSelectedVersion(parseInt(operatorVersionMatch[2], 10));
        return;
      }

      // 4. Operator live: /manual/:slotId or /slot/:slotId
      const match = pathname.match(/^\/(?:manual|slot)\/(\d+)$/);
      if (match) {
        setIsAdmin(false);
        setSelectedSlotId(parseInt(match[1], 10));
        setSelectedVersion(null);
        setSpecificRevision(null);
        return;
      }

      setIsAdmin(false);
      setSelectedSlotId(null);
      setSelectedVersion(null);
      setSpecificRevision(null);
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
      syncAllSlotsFeedback(data.map((s) => s.slot_id)).catch(() => {});
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
    let currentPath = '/';
    if (isAdmin) {
      if (selectedSlotId !== null) {
        currentPath = selectedVersion !== null
          ? `/admin/manual/${selectedSlotId}/v/${selectedVersion}`
          : `/admin/manual/${selectedSlotId}`;
      } else {
        currentPath = '/admin';
      }
    } else {
      if (selectedSlotId !== null) {
        currentPath = selectedVersion !== null
          ? `/manual/${selectedSlotId}/v/${selectedVersion}`
          : `/manual/${selectedSlotId}`;
      } else {
        currentPath = '/';
      }
    }
    sessionStorage.setItem('assembly_last_path', currentPath);
  }, [isAdmin, selectedSlotId, selectedVersion]);

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
  const liveDoc = currentSlot?.live_document;

  // Load specific revision when selectedVersion is specified
  useEffect(() => {
    if (selectedSlotId === null || selectedVersion === null) {
      setSpecificRevision(null);
      return;
    }

    // If liveDoc matches selectedVersion, use it directly
    if (liveDoc && liveDoc.version === selectedVersion) {
      setSpecificRevision(liveDoc);
      return;
    }

    let isCancelled = false;
    setIsLoadingRevision(true);
    fetchSlotRevisionByVersion(selectedSlotId, selectedVersion)
      .then((rev) => {
        if (!isCancelled) {
          setSpecificRevision(rev);
        }
      })
      .catch((err) => {
        console.error('Failed to load version:', err);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingRevision(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedSlotId, selectedVersion, liveDoc]);

  const currentDoc = selectedVersion !== null ? specificRevision : liveDoc;

  const handleReinstateDocument = async (docId: number) => {
    try {
      await adminReinstateRevision(docId);
      await loadSlots();
      if (selectedSlotId !== null) {
        navigateTo(isAdmin ? `/admin/manual/${selectedSlotId}` : `/manual/${selectedSlotId}`);
      }
    } catch (err: any) {
      alert(`Failed to reinstate revision: ${err.message}`);
    }
  };

  const [isCurrentDocCached, setIsCurrentDocCached] = useState(false);
  const SHOW_DEBUG = false;

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
        onBackToSlots={() => navigateTo(isAdmin ? '/admin' : '/')}
        isAdmin={isAdmin}
        onToggleAdmin={() => {
          if (isAdmin) {
            if (selectedSlotId !== null) {
              const target = selectedVersion !== null
                ? `/manual/${selectedSlotId}/v/${selectedVersion}`
                : `/manual/${selectedSlotId}`;
              navigateTo(target);
            } else {
              navigateTo('/');
            }
          } else {
            if (selectedSlotId !== null) {
              const target = selectedVersion !== null
                ? `/admin/manual/${selectedSlotId}/v/${selectedVersion}`
                : `/admin/manual/${selectedSlotId}`;
              navigateTo(target);
            } else {
              navigateTo('/admin');
            }
          }
        }}
        onRefresh={handleRefresh}
      />

      {/* Debug Bar directly underneath Navbar (hidden for now) */}
      {SHOW_DEBUG && (
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
      )}

      {/* Single-line Document Info Strip directly underneath Navbar */}
      {selectedSlotId !== null && (
        <div className="shrink-0 bg-muted/40 border-b border-border px-3 sm:px-4 py-1.5 flex items-center justify-between text-xs min-h-[2.125rem]">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="font-mono text-[11px] shrink-0 font-bold">
              Slot {selectedSlotId}
            </Badge>
            {isAdmin && (
              <Badge
                variant="secondary"
                className="font-mono text-[10px] shrink-0 text-amber-500 border-amber-500/30 bg-amber-500/10"
              >
                Admin
              </Badge>
            )}
            {currentDoc && !currentDoc.is_live && (
              <Badge
                variant="secondary"
                className="font-mono text-[10px] shrink-0 text-amber-400 bg-amber-500/10 border-amber-500/30"
              >
                Obsolete
              </Badge>
            )}
            <span className="font-medium text-foreground truncate">
              {currentDoc?.title || currentDoc?.filename || `Manual Slot ${selectedSlotId}`}
            </span>
            {isLoadingRevision ? (
              <span className="text-muted-foreground text-[11px] shrink-0 font-mono animate-pulse">
                Loading v{selectedVersion}...
              </span>
            ) : currentDoc ? (
              <span className="text-muted-foreground text-[11px] shrink-0 font-mono">
                v{currentDoc.version}
              </span>
            ) : null}
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
        {selectedSlotId !== null ? (
          /* Active Variant: PDFium WebAssembly Fullscreen Viewer with Popover Notes Drawer */
          <SlotViewerVariant
            slotId={selectedSlotId}
            document={currentDoc || null}
            totalFeedbackCount={currentSlot?.total_feedback || 0}
            isAdmin={isAdmin}
            onFeedbackSubmitted={loadSlots}
            onReinstateDocument={handleReinstateDocument}
          />
        ) : isAdmin ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AdminPortal
              onClose={() => navigateTo('/')}
              onSlotsUpdated={loadSlots}
              onViewSlot={(slotId, version) => {
                const target = version !== undefined
                  ? `/admin/manual/${slotId}/v/${version}`
                  : `/admin/manual/${slotId}`;
                navigateTo(target);
              }}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <SlotSelector
              slots={slots}
              onSelectSlot={(slotId) => {
                navigateTo(`/manual/${slotId}`);
              }}
              isLoading={isLoadingSlots}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
