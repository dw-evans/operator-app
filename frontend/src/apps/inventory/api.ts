import type {
  AdjustResponse,
  BatchCreatePayload,
  BatchUpdatePayload,
  CommonNameItem,
  SubassemblyItem,
  InventoryBatch,
  InventoryPart,
  InventoryTransaction,
  PartCreatePayload,
  PartUpdatePayload,
  StockAdjustPayload,
} from './types';

const BASE = '/api/v1/inventory';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore parse failure
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchCommonNames(): Promise<CommonNameItem[]> {
  const res = await fetch(`${BASE}/common-names`);
  return handleResponse<CommonNameItem[]>(res);
}

export async function fetchSubassemblies(): Promise<SubassemblyItem[]> {
  const res = await fetch(`${BASE}/subassemblies`);
  return handleResponse<SubassemblyItem[]>(res);
}

export async function fetchParts(params?: {
  search?: string;
  category?: string;
  subassembly?: string;
  includeObsolete?: boolean;
}): Promise<InventoryPart[]> {
  const qs = new URLSearchParams();
  if (params?.search?.trim()) qs.set('search', params.search.trim());
  if (params?.category?.trim()) qs.set('category', params.category.trim());
  if (params?.subassembly?.trim()) qs.set('subassembly', params.subassembly.trim());
  if (params?.includeObsolete !== undefined) {
    qs.set('include_obsolete', String(params.includeObsolete));
  }
  const query = qs.toString();
  const res = await fetch(`${BASE}/parts${query ? `?${query}` : ''}`);
  return handleResponse<InventoryPart[]>(res);
}

export async function createPart(payload: PartCreatePayload): Promise<InventoryPart> {
  const res = await fetch(`${BASE}/parts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<InventoryPart>(res);
}

export async function updatePart(
  partId: number,
  payload: PartUpdatePayload
): Promise<InventoryPart> {
  const res = await fetch(`${BASE}/parts/${partId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<InventoryPart>(res);
}

export async function createBatch(
  partId: number,
  payload: BatchCreatePayload
): Promise<InventoryBatch> {
  const res = await fetch(`${BASE}/parts/${partId}/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<InventoryBatch>(res);
}

export async function updateBatch(
  batchId: number,
  payload: BatchUpdatePayload
): Promise<InventoryBatch> {
  const res = await fetch(`${BASE}/batches/${batchId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<InventoryBatch>(res);
}

export async function uploadBatchPhotos(
  batchId: number,
  files: File[]
): Promise<InventoryBatch> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('photos', file, file.name);
  }
  const res = await fetch(`${BASE}/batches/${batchId}/photos`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<InventoryBatch>(res);
}

export async function deleteBatchPhoto(
  batchId: number,
  filename: string
): Promise<InventoryBatch> {
  const res = await fetch(
    `${BASE}/batches/${batchId}/photos/${encodeURIComponent(filename)}`,
    { method: 'DELETE' }
  );
  return handleResponse<InventoryBatch>(res);
}

export async function adjustPartStock(
  partId: number,
  payload: StockAdjustPayload
): Promise<AdjustResponse> {
  const res = await fetch(`${BASE}/parts/${partId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<AdjustResponse>(res);
}

export async function undoTransaction(
  txId: number,
  operator: string
): Promise<AdjustResponse> {
  const res = await fetch(`${BASE}/transactions/${txId}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator }),
  });
  return handleResponse<AdjustResponse>(res);
}

export async function fetchTransactions(params?: {
  partId?: number;
  batchId?: number;
  limit?: number;
}): Promise<InventoryTransaction[]> {
  const qs = new URLSearchParams();
  if (params?.partId !== undefined) qs.set('part_id', String(params.partId));
  if (params?.batchId !== undefined) qs.set('batch_id', String(params.batchId));
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  const query = qs.toString();
  const res = await fetch(`${BASE}/transactions${query ? `?${query}` : ''}`);
  return handleResponse<InventoryTransaction[]>(res);
}

export function getExportCsvUrl(): string {
  return `${BASE}/export.csv`;
}
