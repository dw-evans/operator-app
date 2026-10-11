import { openDB, type IDBPDatabase } from 'idb';
import type { FeedbackItem, QueuedFeedback, SlotSummary } from '../types';

const DB_NAME = 'assembly_pwa_db';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('feedback_queue')) {
          db.createObjectStore('feedback_queue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cached_manifest')) {
          db.createObjectStore('cached_manifest', { keyPath: 'slot_id' });
        }
        if (!db.objectStoreNames.contains('media_cache')) {
          db.createObjectStore('media_cache', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('pdf_cache')) {
          db.createObjectStore('pdf_cache', { keyPath: 'url' });
        }
        if (!db.objectStoreNames.contains('cached_feedback')) {
          db.createObjectStore('cached_feedback', { keyPath: 'slot_id' });
        }
      },
    });
  }
  return dbPromise;
}

// Feedback queue
export async function enqueueFeedback(item: QueuedFeedback): Promise<void> {
  const db = await getDb();
  await db.put('feedback_queue', item);
}

export async function getQueuedFeedback(): Promise<QueuedFeedback[]> {
  const db = await getDb();
  return db.getAll('feedback_queue');
}

export async function removeQueuedFeedback(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('feedback_queue', id);
}

export async function getQueuedCount(): Promise<number> {
  const db = await getDb();
  return db.count('feedback_queue');
}

// Manifest cache
export async function saveCachedManifest(slots: SlotSummary[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('cached_manifest', 'readwrite');
  await tx.objectStore('cached_manifest').clear();
  for (const slot of slots) {
    await tx.objectStore('cached_manifest').put(slot);
  }
  await tx.done;
}

export async function getCachedManifest(): Promise<SlotSummary[]> {
  const db = await getDb();
  return db.getAll('cached_manifest');
}

// On-demand video media cache
export async function saveMediaBlob(key: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('media_cache', { key, blob, cachedAt: Date.now() });
}

export async function getMediaBlob(key: string): Promise<Blob | undefined> {
  const db = await getDb();
  const entry = await db.get('media_cache', key);
  return entry?.blob;
}

export async function isMediaCached(key: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.count('media_cache', key);
  return count > 0;
}

// PDF document cache (IndexedDB + CacheStorage dual persistence)
export async function savePdfBlob(
  url: string,
  blob: Blob,
  meta?: { filename?: string; fileHash?: string; slotId?: number }
): Promise<void> {
  const db = await getDb();
  await db.put('pdf_cache', {
    url,
    blob,
    cachedAt: Date.now(),
    ...meta,
  });

  // Also save to CacheStorage for Service Worker interception
  if ('caches' in window) {
    try {
      const cache = await caches.open('assembly_pdf_cache');
      const response = new Response(blob, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': blob.size.toString(),
        },
      });
      await cache.put(url, response.clone());

      const path = new URL(url, window.location.origin).pathname;
      if (path !== url) {
        await cache.put(path, response);
      }
    } catch (err) {
      console.warn('Failed to save PDF to CacheStorage:', err);
    }
  }
}

export async function getPdfBlob(url: string): Promise<Blob | undefined> {
  // Check IndexedDB first
  try {
    const db = await getDb();
    const entry = await db.get('pdf_cache', url);
    if (entry?.blob) return entry.blob;

    const path = new URL(url, window.location.origin).pathname;
    if (path !== url) {
      const pathEntry = await db.get('pdf_cache', path);
      if (pathEntry?.blob) return pathEntry.blob;
    }
  } catch (err) {
    console.warn('Error reading PDF from IndexedDB:', err);
  }

  // Fallback to CacheStorage
  if ('caches' in window) {
    try {
      const cache = await caches.open('assembly_pdf_cache');
      let match = await cache.match(url);
      if (!match) {
        const path = new URL(url, window.location.origin).pathname;
        match = await cache.match(path);
      }
      if (match) {
        return await match.blob();
      }
    } catch (err) {
      console.warn('Error reading PDF from CacheStorage:', err);
    }
  }

  return undefined;
}

export async function isPdfCached(url: string): Promise<boolean> {
  try {
    const db = await getDb();
    const count = await db.count('pdf_cache', url);
    if (count > 0) return true;

    const path = new URL(url, window.location.origin).pathname;
    if (path !== url) {
      const pathCount = await db.count('pdf_cache', path);
      if (pathCount > 0) return true;
    }
  } catch {
    // fallback
  }

  if ('caches' in window) {
    try {
      const cache = await caches.open('assembly_pdf_cache');
      const match = await cache.match(url);
      if (match) return true;

      const path = new URL(url, window.location.origin).pathname;
      if (path !== url) {
        const pathMatch = await cache.match(path);
        if (pathMatch) return true;
      }
    } catch {
      // fallback
    }
  }

  return false;
}

export async function getAllCachedPdfUrls(): Promise<string[]> {
  try {
    const db = await getDb();
    const all = await db.getAll('pdf_cache');
    return all.map((entry) => entry.url);
  } catch {
    return [];
  }
}

// Request browser persistent storage to prevent eviction in Firefox / Chromium PWAs
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        console.log('Persistent storage requested. Granted:', granted);
        return granted;
      }
      return true;
    } catch (err) {
      console.warn('Persistent storage request failed:', err);
      return false;
    }
  }
  return false;
}

// Cached server feedback (notes, pins, comments) per slot and document revision
export async function saveCachedSlotFeedback(
  slotId: number,
  items: FeedbackItem[],
  documentId?: number
): Promise<void> {
  try {
    const db = await getDb();
    const existing = (await db.get('cached_feedback', slotId))?.items || [];
    let combined: FeedbackItem[];
    if (documentId !== undefined) {
      const otherDocs = existing.filter((i: FeedbackItem) => i.document_id !== documentId);
      combined = [...items, ...otherDocs];
    } else {
      combined = items;
    }
    await db.put('cached_feedback', {
      slot_id: slotId,
      items: combined,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn(`Failed to save cached feedback for slot ${slotId}:`, err);
  }
}

export async function getCachedSlotFeedback(
  slotId: number,
  documentId?: number
): Promise<FeedbackItem[]> {
  try {
    const db = await getDb();
    const entry = await db.get('cached_feedback', slotId);
    const all = entry?.items || [];
    if (documentId !== undefined) {
      return all.filter((item: FeedbackItem) => item.document_id === documentId);
    }
    return all;
  } catch (err) {
    console.warn(`Failed to read cached feedback for slot ${slotId}:`, err);
    return [];
  }
}

export async function getQueuedFeedbackForSlot(
  slotId: number,
  documentId?: number
): Promise<QueuedFeedback[]> {
  try {
    const all = await getQueuedFeedback();
    return all.filter((item) => {
      if (item.slot_id !== slotId) return false;
      if (documentId !== undefined) {
        return item.document_id === documentId;
      }
      return true;
    });
  } catch {
    return [];
  }
}

export function queuedToFeedbackItem(q: QueuedFeedback): FeedbackItem {
  return {
    id: q.id,
    station_id: q.station_id || 'Station 1',
    slot_id: q.slot_id,
    document_id: q.document_id || null,
    page_ref: q.page_ref,
    section_ref: q.section_ref || null,
    pin_x: q.pin_x ?? 0.0,
    pin_y: q.pin_y ?? 0.0,
    author: q.author,
    text_comment: q.text_comment || null,
    video_filename: q.videoName || null,
    video_url: q.videoBlob ? URL.createObjectURL(q.videoBlob) : null,
    photo_filenames: q.photoBlobs ? q.photoBlobs.map((p) => p.name) : [],
    photo_urls: q.photoBlobs ? q.photoBlobs.map((p) => URL.createObjectURL(p.blob)) : [],
    timestamp: q.timestamp,
    status: 'open',
  };
}

export function mergeServerAndPendingFeedback(
  serverItems: FeedbackItem[],
  pendingItems: QueuedFeedback[]
): FeedbackItem[] {
  const serverIds = new Set(serverItems.map((i) => i.id));
  const newPending = pendingItems
    .filter((q) => !serverIds.has(q.id))
    .map(queuedToFeedbackItem);

  return [...newPending, ...serverItems];
}

