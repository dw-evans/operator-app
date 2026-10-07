import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { SlotSelector } from './components/SlotSelector';
import { PdfViewer } from './components/PdfViewer';
import { FeedbackEngine } from './components/FeedbackEngine';
import { FeedbackStream } from './components/FeedbackStream';
import { AdminPortal } from './components/AdminPortal';
import { fetchSlots } from './services/api';
import { getCachedManifest, saveCachedManifest } from './services/db';
import type { SlotSummary } from './types';
import { MessageSquare, PlusCircle } from 'lucide-react';

export function App() {
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'submit' | 'stream'>('submit');

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
    loadSlots();
  }, []);

  const currentSlot = slots.find((s) => s.slot_id === selectedSlotId);
  const currentDoc = currentSlot?.live_document;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        currentSlotId={selectedSlotId}
        currentSlotTitle={currentDoc?.title || null}
        onBackToSlots={() => setSelectedSlotId(null)}
        isAdmin={isAdmin}
        onToggleAdmin={() => setIsAdmin(!isAdmin)}
      />

      <main className="flex-1 flex flex-col">
        {isAdmin ? (
          <AdminPortal
            onClose={() => setIsAdmin(false)}
            onSlotsUpdated={loadSlots}
          />
        ) : selectedSlotId === null ? (
          <SlotSelector
            slots={slots}
            onSelectSlot={(slotId) => {
              setSelectedSlotId(slotId);
              setActiveTab('submit');
            }}
            isLoading={isLoadingSlots}
          />
        ) : (
          /* Operator Active Slot Workspace (Dual Panel for Tablets) */
          <div className="flex-1 p-3 md:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 7 columns: Native PDF Viewer */}
            <div className="lg:col-span-7 flex flex-col">
              {currentDoc ? (
                <PdfViewer
                  url={currentDoc.url}
                  title={`Slot ${selectedSlotId}: ${currentDoc.title} (v${currentDoc.version})`}
                />
              ) : (
                <div className="h-[70vh] flex items-center justify-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500 text-sm">
                  No active manual found for Slot {selectedSlotId}.
                </div>
              )}
            </div>

            {/* Right 5 columns: Feedback Engine & Review Stream */}
            <div className="lg:col-span-5 flex flex-col space-y-3">
              {/* Tab Selector */}
              <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveTab('submit')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs md:text-sm font-medium transition-colors cursor-pointer ${
                    activeTab === 'submit'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Submit Note</span>
                </button>

                <button
                  onClick={() => setActiveTab('stream')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs md:text-sm font-medium transition-colors cursor-pointer ${
                    activeTab === 'stream'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Notes & Comments</span>
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
