import { openDB, type IDBPDatabase } from 'idb';
import type { QueuedFeedback, SlotSummary } from '../types';

const DB_NAME = 'assembly_pwa_db';
const DB_VERSION = 1;

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
