import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SlotSelector } from './components/SlotSelector';
import { SlotViewerVariant } from './components/SlotViewerVariant';
import { AdminPortal } from './components/AdminPortal';
import { Badge } from '@/components/ui/badge';
import { fetchSlots } from './services/api';
import { getCachedManifest, saveCachedManifest, requestPersistentStorage } from './services/db';
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
    } catch (err) {
      console.warn('Network fetch failed, attempting to read cached manifest from IndexedDB:', err);
      try {
        const cached = await getCachedManifest();
        if (cached && cached.length > 0) {
          setSlots(cached);
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

  const currentSlot = slots.find((s) => s.slot_id === selectedSlotId);
  const currentDoc = currentSlot?.live_document;

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
