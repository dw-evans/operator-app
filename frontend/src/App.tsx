import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { SlotSelector } from './components/SlotSelector';
import { PdfViewer } from './components/PdfViewer';
import { FeedbackEngine } from './components/FeedbackEngine';
import { FeedbackStream } from './components/FeedbackStream';
import { AdminPortal } from './components/AdminPortal';
import { fetchSlots } from './services/api';
import { getCachedManifest, saveCachedManifest, requestPersistentStorage } from './services/db';
import type { SlotSummary } from './types';
import { MessageSquare, PlusCircle } from 'lucide-react';

export function App() {
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'submit' | 'stream'>('submit');

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Navbar
        currentSlotId={selectedSlotId}
        currentSlotTitle={currentDoc?.title || null}
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

      <main className="flex-1 flex flex-col">
        {isAdmin ? (
          <AdminPortal
            onClose={() => navigateTo('/')}
            onSlotsUpdated={loadSlots}
          />
        ) : selectedSlotId === null ? (
          <SlotSelector
            slots={slots}
            onSelectSlot={(slotId) => {
              navigateTo(`/slot/${slotId}`);
              setActiveTab('submit');
            }}
            isLoading={isLoadingSlots}
          />
        ) : (
          /* Operator Active Slot Workspace (Dual Panel for Tablets) */
          <div className="flex-1 p-3 md:p-4 grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* Left 7 columns: Native PDF Viewer */}
            <div className="lg:col-span-7 flex flex-col">
              {currentDoc ? (
                <PdfViewer
                  url={currentDoc.url}
                  title={`Slot ${selectedSlotId}: ${currentDoc.title} (v${currentDoc.version})`}
                />
              ) : (
                <div className="h-[70vh] flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 text-sm">
                  No active manual found for Slot {selectedSlotId}.
                </div>
              )}
            </div>

            {/* Right 5 columns: Feedback Engine & Review Stream */}
            <div className="lg:col-span-5 flex flex-col space-y-3">
              {/* Tab Selector */}
              <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setActiveTab('submit')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'submit'
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Submit Note</span>
                </button>

                <button
                  onClick={() => setActiveTab('stream')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'stream'
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Station Notes</span>
                </button>
              </div>

              {/* Tab Content */}
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
        )}
      </main>
    </div>
  );
}

export default App;
