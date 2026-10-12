from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class DocumentManifestItem(BaseModel):
    slot_id: int
    title: str
    url: str
    version: int
    file_hash: str
    file_size: int
    upload_date: datetime


class ManifestResponse(BaseModel):
    documents: List[DocumentManifestItem]


class DocumentRevision(BaseModel):
    id: int
    slot_id: int
    title: str
    filename: str
    original_filename: str
    file_hash: str
    file_size: int
    version: int
    is_live: bool
    upload_date: datetime
    obsolescence_date: Optional[datetime] = None
    url: str


class SlotSummary(BaseModel):
    slot_id: int
    live_document: Optional[DocumentRevision] = None
    total_revisions: int = 0
    total_feedback: int = 0
    open_feedback: int = 0


class FeedbackItem(BaseModel):
    id: str
    slot_id: int
    document_id: Optional[int] = None
    page_ref: int
    section_ref: Optional[str] = None
    pin_x: Optional[float] = 0.0
    pin_y: Optional[float] = 0.0
    author: str
    text_comment: Optional[str] = None
    video_filename: Optional[str] = None
    video_url: Optional[str] = None
    photo_filenames: List[str] = Field(default_factory=list)
    photo_urls: List[str] = Field(default_factory=list)
    timestamp: datetime
    status: str
    is_deleted: Optional[bool] = False


class FeedbackStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(open|reviewed|resolved)$")


class FeedbackUpdate(BaseModel):
    text_comment: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(open|reviewed|resolved)$")


class PinVerifyRequest(BaseModel):
    pin: str


class PinVerifyResponse(BaseModel):
    valid: bool
    pin_required: bool
