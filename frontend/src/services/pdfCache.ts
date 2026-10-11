import { isPdfCached, savePdfBlob } from './db';
import type { SlotSummary } from '../types';

export interface PdfCacheState {
  totalDocs: number;
  cachedDocs: number;
  isCaching: boolean;
  allCached: boolean;
  cachedUrls: Record<string, boolean>;
}

type Listener = (state: PdfCacheState) => void;

class PdfCacheManager {
  private state: PdfCacheState = {
    totalDocs: 0,
    cachedDocs: 0,
    isCaching: false,
    allCached: false,
    cachedUrls: {},
  };

  private listeners: Set<Listener> = new Set();
  private lastSlots: SlotSummary[] = [];
  private activeSyncPromise: Promise<void> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.lastSlots.length > 0) {
          this.cacheAllDocuments(this.lastSlots);
        }
      });
    }
  }

  public getState(): PdfCacheState {
    return { ...this.state };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('Error in pdfCache listener:', err);
      }
    });
  }

  public isDocumentCached(url: string | undefined | null): boolean {
    if (!url) return false;
    return Boolean(this.state.cachedUrls[url]);
  }

  public async cacheAllDocuments(slots: SlotSummary[]): Promise<void> {
    this.lastSlots = slots;

    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = this.performCacheAll(slots).finally(() => {
      this.activeSyncPromise = null;
    });

    return this.activeSyncPromise;
  }

  private async performCacheAll(slots: SlotSummary[]): Promise<void> {
    const docsToStore: { slotId: number; url: string; filename: string; fileHash: string }[] = [];

    slots.forEach((slot) => {
      if (slot.live_document && slot.live_document.url) {
        docsToStore.push({
          slotId: slot.slot_id,
          url: slot.live_document.url,
          filename: slot.live_document.filename,
          fileHash: slot.live_document.file_hash,
        });
      }
    });

    const totalDocs = docsToStore.length;
    const currentCachedUrls = { ...this.state.cachedUrls };

    // Initial pass: check what is already cached locally
    for (const doc of docsToStore) {
      const cached = await isPdfCached(doc.url);
      if (cached) {
        currentCachedUrls[doc.url] = true;
      }
    }

    let initialCachedCount = Object.keys(currentCachedUrls).filter((u) =>
      docsToStore.some((d) => d.url === u)
    ).length;

    this.state = {
      ...this.state,
      totalDocs,
      cachedDocs: initialCachedCount,
      cachedUrls: currentCachedUrls,
      allCached: totalDocs > 0 && initialCachedCount === totalDocs,
    };
    this.notify();

    // Second pass: fetch and store any missing PDFs in background if online
    const missingDocs = docsToStore.filter((d) => !currentCachedUrls[d.url]);

    if (missingDocs.length > 0 && typeof navigator !== 'undefined' && navigator.onLine) {
      this.state.isCaching = true;
      this.notify();

      for (const doc of missingDocs) {
        try {
          const res = await fetch(doc.url);
          if (res.ok) {
            const blob = await res.blob();
            await savePdfBlob(doc.url, blob, {
              filename: doc.filename,
              fileHash: doc.fileHash,
              slotId: doc.slotId,
            });
            currentCachedUrls[doc.url] = true;
            this.state.cachedUrls = { ...currentCachedUrls };
            this.state.cachedDocs = Object.keys(currentCachedUrls).filter((u) =>
              docsToStore.some((d) => d.url === u)
            ).length;
            this.state.allCached = totalDocs > 0 && this.state.cachedDocs === totalDocs;
            this.notify();
          }
        } catch (fetchErr) {
          console.warn(`Failed to cache PDF ${doc.url} offline:`, fetchErr);
        }
      }

      this.state.isCaching = false;
      this.state.allCached = totalDocs > 0 && this.state.cachedDocs === totalDocs;
      this.notify();
    }
  }
}

export const pdfCacheManager = new PdfCacheManager();
