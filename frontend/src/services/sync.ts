import { getQueuedCount, getQueuedFeedback, removeQueuedFeedback } from './db';
import { submitFeedbackDirect, syncAllSlotsFeedback } from './api';
import type { QueuedFeedback } from '../types';

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: Date | null;
}

export type SyncListener = (state: SyncState) => void;

class SyncManager {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing: boolean = false;
  private pendingCount: number = 0;
  private lastSyncedAt: Date | null = null;
  private listeners: Set<SyncListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('assembly_last_synced_at');
        if (stored) {
          const parsed = new Date(stored);
          if (!isNaN(parsed.getTime())) {
            this.lastSyncedAt = parsed;
          }
        }
      } catch {
        // ignore local storage parse error
      }

      if (!this.lastSyncedAt && this.isOnline) {
        this.lastSyncedAt = new Date();
      }

      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
      // Heartbeat check every 15 seconds
      setInterval(() => this.checkConnectivity(), 15000);
      this.refreshCount();
    }
  }

  public getState(): SyncState {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.pendingCount,
      lastSyncedAt: this.lastSyncedAt,
    };
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    }
  }

  public recordSuccessfulSync(): void {
    this.lastSyncedAt = new Date();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('assembly_last_synced_at', this.lastSyncedAt.toISOString());
      }
    } catch {
      // ignore storage error
    }
    this.notify();
  }

  public async refreshCount(): Promise<number> {
    try {
      this.pendingCount = await getQueuedCount();
      this.notify();
    } catch {
      // Ignore in non-browser or early-load states
    }
    return this.pendingCount;
  }

  private async handleNetworkChange(online: boolean) {
    this.isOnline = online;
    this.notify();
    if (online) {
      await this.triggerSync();
    }
  }

  public async checkConnectivity(): Promise<boolean> {
    try {
      const res = await fetch('/api/v1/health', { method: 'HEAD', cache: 'no-store' });
      const online = res.ok || res.status < 400;
      if (online !== this.isOnline) {
        this.isOnline = online;
        this.notify();
        if (online) {
          this.triggerSync();
        }
      }
      if (online && !this.lastSyncedAt) {
        this.recordSuccessfulSync();
      }
      return online;
    } catch {
      if (this.isOnline) {
        this.isOnline = false;
        this.notify();
      }
      return false;
    }
  }

  public async triggerSync(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;

    this.isSyncing = true;
    this.notify();

    let allSucceeded = true;

    try {
      const items: QueuedFeedback[] = await getQueuedFeedback();
      for (const item of items) {
        try {
          const formData = new FormData();
          formData.append('id', item.id);
          formData.append('slot_id', item.slot_id.toString());
          formData.append('page_ref', item.page_ref.toString());
          if (item.section_ref) {
            formData.append('section_ref', item.section_ref);
          }
          if (item.pin_x !== undefined && item.pin_x !== null) {
            formData.append('pin_x', item.pin_x.toString());
          }
          if (item.pin_y !== undefined && item.pin_y !== null) {
            formData.append('pin_y', item.pin_y.toString());
          }
          formData.append('author', item.author);
          if (item.text_comment) {
            formData.append('text_comment', item.text_comment);
          }

          if (item.videoBlob) {
            const fileName = item.videoName || `${item.id}_video.mp4`;
            formData.append('video', item.videoBlob, fileName);
          }

          if (item.photoBlobs && item.photoBlobs.length > 0) {
            for (const p of item.photoBlobs) {
              formData.append('photos', p.blob, p.name);
            }
          }

          await submitFeedbackDirect(formData);
          await removeQueuedFeedback(item.id);
          this.pendingCount = Math.max(0, this.pendingCount - 1);
          this.notify();
        } catch (itemErr) {
          console.warn('Sync failed for item', item.id, itemErr);
          this.isOnline = false;
          allSucceeded = false;
          break;
        }
      }

      if (allSucceeded && this.isOnline) {
        this.recordSuccessfulSync();
        try {
          await syncAllSlotsFeedback();
        } catch {
          // Ignore background note caching errors
        }
      }
    } finally {
      this.isSyncing = false;
      await this.refreshCount();
      this.notify();
    }
  }
}

export const syncManager = new SyncManager();
