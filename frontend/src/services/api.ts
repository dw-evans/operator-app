import type { DocumentRevision, FeedbackItem, SlotSummary } from '../types';
import {
  saveCachedSlotFeedback,
  getCachedSlotFeedback,
  getQueuedFeedbackForSlot,
  mergeServerAndPendingFeedback,
} from './db';

export const API_BASE = '';

export async function fetchSlots(): Promise<SlotSummary[]> {
  const res = await fetch(`${API_BASE}/api/v1/slots`);
  if (!res.ok) throw new Error(`Failed to fetch slots: ${res.statusText}`);
  return res.json();
}

export async function fetchSlotFeedback(
  slotId: number,
  documentId?: number
): Promise<FeedbackItem[]> {
  try {
    const url = documentId !== undefined
      ? `${API_BASE}/api/v1/feedback/${slotId}?document_id=${documentId}`
      : `${API_BASE}/api/v1/feedback/${slotId}`;
    const res = await fetch(url);
    if (res.ok) {
      const items: FeedbackItem[] = await res.json();
      await saveCachedSlotFeedback(slotId, items, documentId);
      const pending = await getQueuedFeedbackForSlot(slotId, documentId);
      return mergeServerAndPendingFeedback(items, pending);
    }
  } catch (err) {
    console.warn(`Network fetch failed for slot ${slotId} feedback, reading from IndexedDB:`, err);
  }

  // Offline fallback: load cached notes/pins from IndexedDB and merge with local queue
  const cachedItems = await getCachedSlotFeedback(slotId, documentId);
  const pending = await getQueuedFeedbackForSlot(slotId, documentId);
  return mergeServerAndPendingFeedback(cachedItems, pending);
}

export async function adminReinstateRevision(docId: number): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/admin/reinstate/${docId}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to reinstate revision: ${res.statusText}`);
  return res.json();
}

export async function syncAllSlotsFeedback(slotIds?: number[]): Promise<void> {
  const ids = slotIds && slotIds.length > 0 ? slotIds : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  await Promise.allSettled(
    ids.map(async (slotId) => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/feedback/${slotId}`);
        if (res.ok) {
          const items: FeedbackItem[] = await res.json();
          await saveCachedSlotFeedback(slotId, items);
        }
      } catch {
        // Ignore single slot failure during background pre-caching
      }
    })
  );
}

export async function submitFeedbackDirect(formData: FormData): Promise<{ status: string; id: string }> {
  const res = await fetch(`${API_BASE}/api/v1/feedback`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Failed to submit feedback: ${res.statusText}`);
  return res.json();
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: 'open' | 'reviewed' | 'resolved'
): Promise<{ status: string; id: string; new_status: string }> {
  const res = await fetch(`${API_BASE}/api/v1/feedback/${feedbackId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update status: ${res.statusText}`);
  return res.json();
}

export async function adminUploadManual(
  slotId: number,
  file: File
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/v1/admin/upload/${slotId}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Failed to upload manual: ${res.statusText}`);
  return res.json();
}

export async function fetchSlotHistory(slotId: number): Promise<DocumentRevision[]> {
  const res = await fetch(`${API_BASE}/api/v1/admin/history/${slotId}`);
  if (!res.ok) throw new Error(`Failed to fetch revision history: ${res.statusText}`);
  return res.json();
}

export async function checkPinStatus(): Promise<{ valid: boolean; pin_required: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/admin/pin-status`);
  if (!res.ok) throw new Error(`Failed to check PIN status: ${res.statusText}`);
  return res.json();
}

export async function verifyPin(pin: string): Promise<{ valid: boolean; pin_required: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/admin/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) throw new Error(`Failed to verify PIN: ${res.statusText}`);
  return res.json();
}

