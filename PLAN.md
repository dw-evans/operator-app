Technical Design Document: Offline-First Assembly Instruction & Feedback PWA

1. Executive Summary & Architecture Overview
   This document specifies the technical architecture for an air-gapped, offline-first assembly instruction and feedback system tailored for 6 Android tablets running Mozilla Firefox.

Network Topology: Local isolated wireless router connected to a Mini PC/Raspberry Pi server. No external internet dependency.

Backend: Python managed via uv, FastAPI, SQLAlchemy, and SQLite. The backend also hosts the compiled React/Shadcn PWA static assets.

Frontend (Operator PWA): React with Tailwind CSS and minimal Shadcn components. Leverages Service Workers, Cache Storage API, and IndexedDB for offline resilience and background sync. Uses the browser’s native PDF rendering engine.

Frontend (Admin Portal): A web-based management interface providing 10 fixed document slots with full lifecycle versioning (live vs. archived/obsolete) and comment auditing.

2. Database Schema (SQLAlchemy / SQLite)
   [ documents ] (10 fixed slots with history)
   │
   └── 1-to-Many ──> [ feedback ] (Text, video, photos, page refs)
   2.1 Models Definition (models.py)
   Python
   from datetime import datetime
   from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
   from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Document(Base):
**tablename** = "documents"

    id = Column(Integer, primary_key=True, index=True)
    slot_id = Column(Integer, index=True)  # Slots 1 through 10
    title = Column(String, nullable=False)
    filename = Column(String, nullable=False)  # Stored file name on disk
    original_filename = Column(String, nullable=False)
    file_hash = Column(String, nullable=False)
    version = Column(Integer, default=1)
    is_live = Column(Boolean, default=True)
    upload_date = Column(DateTime, default=datetime.utcnow)
    obsolescence_date = Column(DateTime, nullable=True)

    feedback = relationship("Feedback", back_populates="document")

class Feedback(Base):
**tablename** = "feedback"

    id = Column(String, primary_key=True)  # UUID generated client-side
    station_id = Column(String, nullable=False)
    slot_id = Column(Integer, ForeignKey("documents.slot_id"), nullable=False)
    page_ref = Column(Integer, nullable=False)
    author = Column(String, nullable=False)
    text_comment = Column(Text, nullable=True)
    video_filename = Column(String, nullable=True)
    photo_filenames = Column(Text, nullable=True)  # JSON-encoded list of photo paths
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="open")  # open, reviewed, resolved

    document = relationship("Document", back_populates="feedback")

3. Backend Implementation (uv, FastAPI, Pydantic)
3.1 Project Structure & Dependencies (pyproject.toml)
Managed via uv:

Ini, TOML
[project]
name = "assembly-pwa-server"
version = "0.1.0"
dependencies = [
"fastapi>=0.115.0",
"uvicorn>=0.30.0",
"sqlalchemy>=2.0.0",
"pydantic>=2.0.0",
"python-multipart>=0.0.9"
]
3.2 Pydantic Schemas & FastAPI Endpoints (main.py)
Python
import hashlib
import json
import os
from typing import List, Optional
from fastapi import FastAPI, Depends, File, UploadFile, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Assume SessionLocal and models are imported from local modules

app = FastAPI(title="Assembly Pwa Backend")

# Ensure storage directories exist

os.makedirs("storage/manuals", exist_ok=True)
os.makedirs("storage/media", exist_ok=True)

class FeedbackCreate(BaseModel):
id: str
station_id: str
slot_id: int
page_ref: int
author: str
text_comment: Optional[str] = None

@app.get("/api/v1/manifest")
def get_manifest(db: Session = Depends(get_db)):
live_docs = db.query(Document).filter(Document.is_live == True).all()
return {
"documents": [
{
"slot_id": doc.slot_id,
"title": doc.title,
"url": f"/manuals/{doc.filename}?v={doc.file_hash}",
"version": doc.version
} for doc in live_docs
]
}

@app.post("/api/v1/feedback")
async def create_feedback(
id: str = Form(...),
station_id: str = Form(...),
slot_id: int = Form(...),
page_ref: int = Form(...),
author: str = Form(...),
text_comment: Optional[str] = Form(None),
video: Optional[UploadFile] = File(None),
photos: List[UploadFile] = File([]),
db: Session = Depends(get_db)
):
video_filename = None
if video:
v_ext = video.filename.split(".")[-1]
video_filename = f"{id}_video.{v_ext}"
with open(f"storage/media/{video_filename}", "wb") as f:
f.write(await video.read())

    photo_names = []
    for idx, photo in enumerate(photos):
        p_ext = photo.filename.split(".")[-1]
        p_name = f"{id}_photo_{idx}.{p_ext}"
        with open(f"storage/media/{p_name}", "wb") as f:
            f.write(await photo.read())
        photo_names.append(p_name)

    db_feedback = Feedback(
        id=id,
        station_id=station_id,
        slot_id=slot_id,
        page_ref=page_ref,
        author=author,
        text_comment=text_comment,
        video_filename=video_filename,
        photo_filenames=json.dumps(photo_names)
    )
    db.add(db_feedback)
    db.commit()
    return {"status": "success", "id": id}

@app.get("/api/v1/feedback/{slot_id}")
def get_slot_feedback(slot_id: int, db: Session = Depends(get_db)):
items = db.query(Feedback).filter(Feedback.slot_id == slot_id).all()
return items

# Admin Upload Route for the 10 Slots

@app.post("/api/v1/admin/upload/{slot_id}")
async def admin_upload(slot_id: int, title: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db)):
content = await file.read()
file_hash = hashlib.md5(content).hexdigest()[:8]
stored_filename = f"slot_{slot_id}_{file_hash}.pdf"

    with open(f"storage/manuals/{stored_filename}", "wb") as f:
        f.write(content)

    # Mark existing live doc for this slot as obsolete
    existing = db.query(Document).filter(Document.slot_id == slot_id, Document.is_live == True).first()
    if existing:
        existing.is_live = False
        existing.obsolescence_date = datetime.utcnow()

    # Create new live document version
    new_version = (existing.version + 1) if existing else 1
    new_doc = Document(
        slot_id=slot_id,
        title=title,
        filename=stored_filename,
        original_filename=file.filename,
        file_hash=file_hash,
        version=new_version,
        is_live=True
    )
    db.add(new_doc)
    db.commit()
    return {"status": "success", "slot_id": slot_id, "version": new_version}

# Mount static files and frontend build

app.mount("/manuals", StaticFiles(directory="storage/manuals"), name="manuals")
app.mount("/media", StaticFiles(directory="storage/media"), name="media")
app.mount("/", StaticFiles(directory="static_pwa", html=True), name="pwa") 4. Frontend Architecture (React, Tailwind, Shadcn Bare Minimum)
4.1 Operator PWA View
PDF Renderer: Relies on Mozilla Firefox Android browser's native PDF viewing capabilities via standard HTML <iframe> or <embed> tags pointing to the cached blob URL.

Feedback Engine:

Operators select a document slot and specify the current Page Reference.

Capture options include text notes, a direct camera video recording link (<input type="file" accept="video/*" capture="environment">), and photo uploads (accept="image/*").

Offline Queueing: If offline, payloads are saved into an IndexedDB store (feedback_queue). A background listener monitors navigator.onLine and flushes the queue via asynchronous fetch requests when reconnected.

Comment Review Stream: A dedicated sidebar or tab allowing operators to scroll through all historic feedback for the active document (showing author, timestamp, page reference, text, images, and embedded video players).

4.2 Admin Portal View
Main Dashboard: Displays 10 rows corresponding to slots 1–10. Each row features the active document title, version, upload date, and a simple upload form ([Title Input] [Choose PDF File] [Upload]).

Detailed History Page (/admin/history/{slot_id}): Displays a full chronological table of past revisions for that slot, tracking upload timestamps, obsolescence dates, file hashes, and quick links to download archived PDFs.

5. Deployment & Verification Script
   To initialize and launch the stack via uv:

Bash

# Initialize environment

uv venv
source .venv/bin/activate
uv pip install fastapi uvicorn sqlalchemy python-multipart

# Run FastAPI server

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
