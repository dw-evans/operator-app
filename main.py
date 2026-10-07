import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from database import Base, engine, get_db
import models
import schemas

# Create directories anchored to server base path
BASE_DIR = Path(__file__).resolve().parent
MANUALS_DIR = BASE_DIR / "storage" / "manuals"
MEDIA_DIR = BASE_DIR / "storage" / "media"
STATIC_PWA_DIR = BASE_DIR / "static_pwa"

MANUALS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
STATIC_PWA_DIR.mkdir(parents=True, exist_ok=True)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Assembly Instruction & Feedback System",
    description="Offline-first PWA server for air-gapped shop floor stations",
    version="0.1.0",
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/manifest", response_model=schemas.ManifestResponse)
def get_manifest(db: Session = Depends(get_db)):
    """Return all live documents for slots 1-10."""
    live_docs = (
        db.query(models.Document)
        .filter(models.Document.is_live == True)
        .order_by(models.Document.slot_id)
        .all()
    )
    return {
        "documents": [
            {
                "slot_id": doc.slot_id,
                "title": doc.title,
                "url": f"/manuals/{doc.filename}?v={doc.file_hash}",
                "version": doc.version,
                "file_hash": doc.file_hash,
                "file_size": doc.file_size,
                "upload_date": doc.upload_date,
            }
            for doc in live_docs
        ]
    }


@app.get("/api/v1/slots", response_model=List[schemas.SlotSummary])
def get_slots_summary(db: Session = Depends(get_db)):
    """Return summary for all 10 slots (1-10) with live document and feedback counts."""
    summaries = []
    for slot_id in range(1, 11):
        live_doc = (
            db.query(models.Document)
            .filter(models.Document.slot_id == slot_id, models.Document.is_live == True)
            .first()
        )
        total_revs = (
            db.query(models.Document)
            .filter(models.Document.slot_id == slot_id)
            .count()
        )
        total_fb = (
            db.query(models.Feedback)
            .filter(models.Feedback.slot_id == slot_id)
            .count()
        )
        open_fb = (
            db.query(models.Feedback)
            .filter(models.Feedback.slot_id == slot_id, models.Feedback.status == "open")
            .count()
        )

        doc_summary = None
        if live_doc:
            doc_summary = schemas.DocumentRevision(
                id=live_doc.id,
                slot_id=live_doc.slot_id,
                title=live_doc.title,
                filename=live_doc.filename,
                original_filename=live_doc.original_filename,
                file_hash=live_doc.file_hash,
                file_size=live_doc.file_size,
                version=live_doc.version,
                is_live=live_doc.is_live,
                upload_date=live_doc.upload_date,
                obsolescence_date=live_doc.obsolescence_date,
                url=f"/manuals/{live_doc.filename}?v={live_doc.file_hash}",
            )

        summaries.append(
            schemas.SlotSummary(
                slot_id=slot_id,
                live_document=doc_summary,
                total_revisions=total_revs,
                total_feedback=total_fb,
                open_feedback=open_fb,
            )
        )
    return summaries


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
    db: Session = Depends(get_db),
):
    """Receive operator feedback with optional video and photo uploads."""
    if slot_id < 1 or slot_id > 10:
        raise HTTPException(status_code=400, detail="Slot ID must be between 1 and 10")

    # Check if feedback already exists (idempotency for offline sync retries)
    existing_fb = db.query(models.Feedback).filter(models.Feedback.id == id).first()
    if existing_fb:
        return {"status": "success", "id": id, "message": "Feedback already recorded"}

    # Find the current live document for this slot to link document_id
    live_doc = (
        db.query(models.Document)
        .filter(models.Document.slot_id == slot_id, models.Document.is_live == True)
        .first()
    )
    doc_id = live_doc.id if live_doc else None

    # Process video file
    video_filename = None
    if video and video.filename:
        v_ext = video.filename.split(".")[-1].lower() if "." in video.filename else "mp4"
        video_filename = f"{id}_video.{v_ext}"
        v_path = MEDIA_DIR / video_filename
        content = await video.read()
        with open(v_path, "wb") as f:
            f.write(content)

    # Process photo files
    photo_names = []
    for idx, photo in enumerate(photos):
        if photo and photo.filename:
            p_ext = photo.filename.split(".")[-1].lower() if "." in photo.filename else "jpg"
            p_name = f"{id}_photo_{idx}.{p_ext}"
            p_path = MEDIA_DIR / p_name
            content = await photo.read()
            with open(p_path, "wb") as f:
                f.write(content)
            photo_names.append(p_name)

    db_feedback = models.Feedback(
        id=id,
        station_id=station_id,
        slot_id=slot_id,
        document_id=doc_id,
        page_ref=page_ref,
        author=author,
        text_comment=text_comment,
        video_filename=video_filename,
        photo_filenames=json.dumps(photo_names),
        timestamp=datetime.now(timezone.utc),
        status="open",
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)

    return {"status": "success", "id": id}


@app.get("/api/v1/feedback/{slot_id}", response_model=List[schemas.FeedbackItem])
def get_slot_feedback(slot_id: int, db: Session = Depends(get_db)):
    """Retrieve all feedback submitted for a slot, ordered newest first."""
    items = (
        db.query(models.Feedback)
        .filter(models.Feedback.slot_id == slot_id)
        .order_by(models.Feedback.timestamp.desc())
        .all()
    )
    result = []
    for item in items:
        p_names = json.loads(item.photo_filenames) if item.photo_filenames else []
        result.append(
            schemas.FeedbackItem(
                id=item.id,
                station_id=item.station_id,
                slot_id=item.slot_id,
                document_id=item.document_id,
                page_ref=item.page_ref,
                author=item.author,
                text_comment=item.text_comment,
                video_filename=item.video_filename,
                video_url=f"/media/{item.video_filename}" if item.video_filename else None,
                photo_filenames=p_names,
                photo_urls=[f"/media/{p}" for p in p_names],
                timestamp=item.timestamp,
                status=item.status,
            )
        )
    return result


@app.patch("/api/v1/feedback/{feedback_id}/status")
def update_feedback_status(
    feedback_id: str,
    status_update: schemas.FeedbackStatusUpdate,
    db: Session = Depends(get_db),
):
    """Update feedback status (open, reviewed, resolved)."""
    item = db.query(models.Feedback).filter(models.Feedback.id == feedback_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Feedback item not found")

    item.status = status_update.status
    db.commit()
    db.refresh(item)
    return {"status": "success", "id": item.id, "new_status": item.status}


@app.post("/api/v1/admin/upload/{slot_id}")
async def admin_upload(
    slot_id: int,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload or replace a manual for a slot (1-10). Defaults title to filename and records upload date."""
    if slot_id < 1 or slot_id > 10:
        raise HTTPException(status_code=400, detail="Slot ID must be between 1 and 10")

    content = await file.read()
    file_size = len(content)
    file_hash = hashlib.md5(content).hexdigest()[:8]
    stored_filename = f"slot_{slot_id}_{file_hash}.pdf"
    file_path = MANUALS_DIR / stored_filename

    with open(file_path, "wb") as f:
        f.write(content)

    doc_title = title.strip() if title and title.strip() else (file.filename or f"Manual Slot {slot_id}")

    # Mark existing live document for this slot as obsolete
    existing = (
        db.query(models.Document)
        .filter(models.Document.slot_id == slot_id, models.Document.is_live == True)
        .first()
    )
    if existing:
        existing.is_live = False
        existing.obsolescence_date = datetime.now(timezone.utc)

    # Increment version or start at 1
    new_version = (existing.version + 1) if existing else 1

    new_doc = models.Document(
        slot_id=slot_id,
        title=doc_title,
        filename=stored_filename,
        original_filename=file.filename or stored_filename,
        file_hash=file_hash,
        file_size=file_size,
        version=new_version,
        is_live=True,
        upload_date=datetime.now(timezone.utc),
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    return {
        "status": "success",
        "slot_id": slot_id,
        "version": new_version,
        "title": doc_title,
        "file_hash": file_hash,
        "filename": stored_filename,
    }


@app.get("/api/v1/admin/history/{slot_id}", response_model=List[schemas.DocumentRevision])
def get_slot_history(slot_id: int, db: Session = Depends(get_db)):
    """Retrieve full revision history for a slot (live and obsolete), newest first."""
    if slot_id < 1 or slot_id > 10:
        raise HTTPException(status_code=400, detail="Slot ID must be between 1 and 10")

    revs = (
        db.query(models.Document)
        .filter(models.Document.slot_id == slot_id)
        .order_by(models.Document.version.desc())
        .all()
    )
    return [
        schemas.DocumentRevision(
            id=doc.id,
            slot_id=doc.slot_id,
            title=doc.title,
            filename=doc.filename,
            original_filename=doc.original_filename,
            file_hash=doc.file_hash,
            file_size=doc.file_size,
            version=doc.version,
            is_live=doc.is_live,
            upload_date=doc.upload_date,
            obsolescence_date=doc.obsolescence_date,
            url=f"/manuals/{doc.filename}?v={doc.file_hash}",
        )
        for doc in revs
    ]


@app.get("/api/v1/admin/pin-status", response_model=schemas.PinVerifyResponse)
def get_pin_status():
    """Check if an admin PIN is configured."""
    admin_pin = os.environ.get("ADMIN_PIN")
    pin_required = bool(admin_pin and admin_pin.strip())
    return {"valid": not pin_required, "pin_required": pin_required}


@app.post("/api/v1/admin/verify-pin", response_model=schemas.PinVerifyResponse)
def verify_admin_pin(req: schemas.PinVerifyRequest):
    """Verify an admin PIN."""
    admin_pin = os.environ.get("ADMIN_PIN")
    if not admin_pin or not admin_pin.strip():
        return {"valid": True, "pin_required": False}

    valid = req.pin == admin_pin.strip()
    return {"valid": valid, "pin_required": True}


# Mount storage directories
app.mount("/manuals", StaticFiles(directory=str(MANUALS_DIR)), name="manuals")
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")


# SPA Fallback for static PWA
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve static PWA files with index.html fallback for client-side routing."""
    clean_path = full_path.lstrip("/")
    if clean_path.startswith(("api/", "manuals/", "media/")) or clean_path in ("api", "manuals", "media"):
        raise HTTPException(status_code=404, detail="Resource not found")

    target = STATIC_PWA_DIR / clean_path
    if target.is_file():
        return FileResponse(target)

    index_file = STATIC_PWA_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)

    return {
        "name": "Assembly PWA Backend Server",
        "status": "running",
        "api_docs": "/docs",
        "manifest": "/api/v1/manifest",
        "message": "PWA frontend is compiling or not yet built into static_pwa/",
    }
