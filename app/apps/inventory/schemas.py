from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class CommonNameItem(BaseModel):
    id: int
    name: str


class BatchCreate(BaseModel):
    batch_number: str = Field(..., min_length=1)
    received_date: Optional[str] = None
    location: Optional[str] = None
    initial_quantity: int = 0
    batch_status: str = Field(
        default="active", pattern="^(active|non_conformant|depleted)$"
    )
    notes: Optional[str] = None
    operator: str = Field(default="Operator")


class BatchUpdate(BaseModel):
    batch_number: Optional[str] = None
    received_date: Optional[str] = None
    location: Optional[str] = None
    batch_status: Optional[str] = Field(
        None, pattern="^(active|non_conformant|depleted)$"
    )
    notes: Optional[str] = None


class BatchResponse(BaseModel):
    id: int
    part_id: int
    batch_number: str
    received_date: Optional[str] = None
    location: Optional[str] = None
    quantity: int
    batch_status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PartCreate(BaseModel):
    part_number: str = Field(..., min_length=1)
    revision: str = Field(default="1", min_length=1)
    iteration: str = Field(default="")
    name: str = Field(..., min_length=1)
    common_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit: str = Field(default="pcs")
    lifecycle_status: str = Field(default="active", pattern="^(active|obsolete)$")
    # Optional initial batch created atomically alongside the part
    initial_batch_number: Optional[str] = None
    initial_received_date: Optional[str] = None
    initial_location: Optional[str] = None
    initial_quantity: int = 0
    operator: str = Field(default="Operator")


class PartUpdate(BaseModel):
    part_number: Optional[str] = None
    revision: Optional[str] = None
    iteration: Optional[str] = None
    name: Optional[str] = None
    common_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    lifecycle_status: Optional[str] = Field(None, pattern="^(active|obsolete)$")
    is_archived: Optional[bool] = None


class PartResponse(BaseModel):
    id: int
    part_number: str
    revision: str
    iteration: str
    name: str
    common_name: Optional[str] = None
    common_name_id: Optional[int] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit: str
    lifecycle_status: str
    is_archived: bool
    total_active_quantity: int = 0
    total_all_quantity: int = 0
    batches: List[BatchResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class StockAdjustRequest(BaseModel):
    delta: Optional[int] = None
    set_quantity: Optional[int] = None
    reason: Optional[str] = None
    operator: str = Field(..., min_length=1)


class UndoTransactionRequest(BaseModel):
    operator: str = Field(..., min_length=1)


class TransactionResponse(BaseModel):
    id: int
    batch_id: int
    part_id: int
    part_number: str
    revision: str
    iteration: str
    part_name: str
    common_name: Optional[str] = None
    batch_number: str
    delta: int
    quantity_before: int
    quantity_after: int
    reason: Optional[str] = None
    operator: str
    reverts_transaction_id: Optional[int] = None
    is_reverted: bool = False
    timestamp: datetime


class AdjustResponse(BaseModel):
    batch: BatchResponse
    transaction: TransactionResponse
