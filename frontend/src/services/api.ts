import type { DocumentRevision, FeedbackItem, SlotSummary } from '../types';

export const API_BASE = '';

export async function fetchSlots(): Promise<SlotSummary[]> {
  const res = await fetch(`${API_BASE}/api/v1/slots`);
  if (!res.ok) throw new Error(`Failed to fetch slots: ${res.statusText}`);
  return res.json();
}

export async function fetchSlotFeedback(slotId: number): Promise<FeedbackItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/feedback/${slotId}`);
  if (!res.ok) throw new Error(`Failed to fetch feedback: ${res.statusText}`);
  return res.json();
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

