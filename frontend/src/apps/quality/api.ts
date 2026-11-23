import type { QualityIssue, QualityIssueStatus } from './types';

const API_BASE = '/api/v1/quality';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) {
        detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function fetchQualityIssues(): Promise<QualityIssue[]> {
  const res = await fetch(`${API_BASE}/issues`);
  return handleResponse<QualityIssue[]>(res);
}

export async function createQualityIssue(payload: {
  part_id: number;
  part_batch_id?: number | null;
  description: string;
  operator: string;
}): Promise<QualityIssue> {
  const res = await fetch(`${API_BASE}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<QualityIssue>(res);
}

export async function updateQualityIssue(
  issueId: number,
  payload: {
    description?: string;
    status?: QualityIssueStatus;
    part_batch_id?: number | null;
    clear_batch?: boolean;
  }
): Promise<QualityIssue> {
  const res = await fetch(`${API_BASE}/issues/${issueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<QualityIssue>(res);
}

export async function deleteQualityIssue(issueId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/issues/${issueId}`, {
    method: 'DELETE',
  });
  await handleResponse<{ deleted: boolean }>(res);
}

export async function uploadQualityIssuePhotos(
  issueId: number,
  files: File[]
): Promise<QualityIssue> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('photos', file);
  }
  const res = await fetch(`${API_BASE}/issues/${issueId}/photos`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<QualityIssue>(res);
}

export async function deleteQualityIssuePhoto(
  issueId: number,
  filename: string
): Promise<QualityIssue> {
  const encoded = filename.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${API_BASE}/issues/${issueId}/photos/${encoded}`, {
    method: 'DELETE',
  });
  return handleResponse<QualityIssue>(res);
}
