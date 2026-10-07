import { getQueuedCount, getQueuedFeedback, removeQueuedFeedback } from './db';
import { submitFeedbackDirect } from './api';
import type { QueuedFeedback } from '../types';

export type SyncListener = (state: {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
}) => void;

class SyncManager {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing: boolean = false;
  private pendingCount: number = 0;
  private listeners: Set<SyncListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
      // Heartbeat check every 15 seconds
      setInterval(() => this.checkConnectivity(), 15000);
      this.refreshCount();
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener({
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.pendingCount,
    });
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener({
        isOnline: this.isOnline,
        isSyncing: this.isSyncing,
        pendingCount: this.pendingCount,
      });
    }
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

    try {
      const items: QueuedFeedback[] = await getQueuedFeedback();
      for (const item of items) {
        try {
          const formData = new FormData();
          formData.append('id', item.id);
          formData.append('station_id', item.station_id);
          formData.append('slot_id', item.slot_id.toString());
          formData.append('page_ref', item.page_ref.toString());
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
          // If network failed mid-sync, halt remaining queue
          this.isOnline = false;
          break;
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
