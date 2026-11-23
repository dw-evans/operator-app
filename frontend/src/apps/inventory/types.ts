export interface CommonNameItem {
  id: number;
  name: string;
}

export type LifecycleStatus = 'active' | 'obsolete';
export type BatchStatus = 'active' | 'depleted';

export interface InventoryBatch {
  id: number;
  part_id: number;
  batch_number: string;
  received_date?: string | null;
  location?: string | null;
  quantity: number;
  batch_status: BatchStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryPart {
  id: number;
  part_number: string;
  revision: string;
  iteration: string;
  name: string;
  common_name?: string | null;
  common_name_id?: number | null;
  description?: string | null;
  category?: string | null;
  unit: string;
  lifecycle_status: LifecycleStatus;
  total_active_quantity: number;
  total_all_quantity: number;
  batches: InventoryBatch[];
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: number;
  batch_id: number;
  part_id: number;
  part_number: string;
  revision: string;
  iteration: string;
  part_name: string;
  common_name?: string | null;
  batch_number: string;
  delta: number;
  quantity_before: number;
  quantity_after: number;
  reason?: string | null;
  operator: string;
  reverts_transaction_id?: number | null;
  is_reverted: boolean;
  timestamp: string;
}

export interface PartCreatePayload {
  part_number: string;
  revision: string;
  iteration: string;
  name: string;
  common_name?: string | null;
  description?: string | null;
  category?: string | null;
  unit: string;
  lifecycle_status: LifecycleStatus;
  initial_batch_number?: string | null;
  initial_received_date?: string | null;
  initial_location?: string | null;
  initial_quantity: number;
  operator: string;
}

export interface PartUpdatePayload {
  part_number?: string;
  revision?: string;
  iteration?: string;
  name?: string;
  common_name?: string | null;
  description?: string | null;
  category?: string | null;
  unit?: string;
  lifecycle_status?: LifecycleStatus;
}

export interface BatchCreatePayload {
  batch_number: string;
  received_date?: string | null;
  location?: string | null;
  initial_quantity: number;
  batch_status: BatchStatus;
  notes?: string | null;
  operator: string;
}

export interface BatchUpdatePayload {
  batch_number?: string;
  received_date?: string | null;
  location?: string | null;
  batch_status?: BatchStatus;
  notes?: string | null;
}

export interface StockAdjustPayload {
  delta?: number;
  set_quantity?: number;
  reason?: string;
  operator: string;
}

export interface AdjustResponse {
  batch: InventoryBatch;
  transaction: InventoryTransaction;
}
