from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class QualityIssueCreate(BaseModel):
    part_id: int
    part_batch_id: Optional[int] = None
    description: str = Field(..., min_length=1)
    status: str = Field(default="open", pattern="^(open|resolved|obsolete)$")
    operator: str = Field(default="Operator")


class QualityIssueUpdate(BaseModel):
    part_batch_id: Optional[int] = None
    clear_batch: bool = False
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(open|resolved|obsolete)$")


class QualityIssueResponse(BaseModel):
    id: int
    part_id: int
    part_batch_id: Optional[int] = None
    part_name: str
    common_name: Optional[str] = None
    part_number: str
    revision: str
    iteration: str = ""
    batch_number: str = ""  # Internal part-level batch identifier (1, 2, 3, 4...)
    batch_code: Optional[str] = None  # Optional specific shipment batch code
    subassembly: Optional[str] = None
    category: Optional[str] = None
    description: str
    status: str = "open"
    photo_filenames: List[str] = Field(default_factory=list)
    photo_urls: List[str] = Field(default_factory=list)
    operator: str
    created_at: datetime
    updated_at: datetime
