import hashlib
import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import config
from app.apps.instructions import models, schemas
from app.apps.instructions.database import get_db

router = APIRouter(tags=["instructions"])


@router.api_route(
    "/api/v1/manifest", methods=["GET", "HEAD"], response_model=schemas.ManifestResponse
)
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


@router.api_route(
    "/api/v1/slots", methods=["GET", "HEAD"], response_model=List[schemas.SlotSummary]
)
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
            db.query(models.Document).filter(models.Document.slot_id == slot_id).count()
        )
        if live_doc:
            total_fb = (
                db.query(models.Feedback)
                .filter(
                    models.Feedback.slot_id == slot_id,
                    models.Feedback.document_id == live_doc.id,
                    models.Feedback.is_deleted == False,
                )
                .count()
            )
            open_fb = (
                db.query(models.Feedback)
                .filter(
                    models.Feedback.slot_id == slot_id,
                    models.Feedback.document_id == live_doc.id,
                    models.Feedback.status == "open",
                    models.Feedback.is_deleted == False,
                )
                .count()
            )
        else:
            total_fb = 0
            open_fb = 0

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


@router.post("/api/v1/feedback")
async def create_feedback(
    id: str = Form(...),
    slot_id: int = Form(...),
    document_id: Optional[int] = Form(None),
    page_ref: int = Form(...),
    section_ref: Optional[str] = Form(None),
    pin_x: Optional[float] = Form(0.0),
    pin_y: Optional[float] = Form(0.0),
    author: str = Form(...),
    text_comment: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    photos: List[UploadFile] = File([]),
    db: Session = Depends(get_db),
):
    """Receive operator feedback with optional video and photo uploads."""
    if slot_id < 1 or slot_id > 10:
        raise HTTPException(status_code=400, detail="Slot ID must be between 1 and 10")

    existing_fb = db.query(models.Feedback).filter(models.Feedback.id == id).first()
    if existing_fb:
        return {"status": "success", "id": id, "message": "Feedback already recorded"}

    if document_id:
        doc_id = document_id
    else:
        live_doc = (
            db.query(models.Document)
            .filter(models.Document.slot_id == slot_id, models.Document.is_live == True)
            .first()
        )
        doc_id = live_doc.id if live_doc else None

    video_filename = None
    if video and video.filename:
        v_ext = (
            video.filename.split(".")[-1].lower() if "." in video.filename else "mp4"
        )
        video_filename = f"{id}_video.{v_ext}"
        v_path = config.MEDIA_DIR / video_filename
        content = await video.read()
        with open(v_path, "wb") as f:
            f.write(content)

    photo_names = []
    for idx, photo in enumerate(photos):
        if photo and photo.filename:
            p_ext = (
                photo.filename.split(".")[-1].lower()
                if "." in photo.filename
                else "jpg"
            )
            p_name = f"{id}_photo_{idx}.{p_ext}"
            p_path = config.MEDIA_DIR / p_name
            content = await photo.read()
            with open(p_path, "wb") as f:
                f.write(content)
            photo_names.append(p_name)

    db_feedback = models.Feedback(
        id=id,
        slot_id=slot_id,
        document_id=doc_id,
        page_ref=page_ref,
        section_ref=section_ref,
        pin_x=pin_x if pin_x is not None else 0.0,
        pin_y=pin_y if pin_y is not None else 0.0,
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


@router.get("/api/v1/feedback/{slot_id}", response_model=List[schemas.FeedbackItem])
def get_slot_feedback(
    slot_id: int,
    document_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Retrieve feedback submitted for a slot, optionally filtered by specific document revision."""
    query = db.query(models.Feedback).filter(
        models.Feedback.slot_id == slot_id,
        models.Feedback.is_deleted == False,
    )
    if document_id is not None:
        query = query.filter(models.Feedback.document_id == document_id)
    items = query.order_by(models.Feedback.timestamp.desc()).all()
    result = []
    for item in items:
        p_names = json.loads(item.photo_filenames) if item.photo_filenames else []
        result.append(
            schemas.FeedbackItem(
                id=item.id,
                slot_id=item.slot_id,
                document_id=item.document_id,
                page_ref=item.page_ref,
                section_ref=item.section_ref,
                pin_x=item.pin_x if item.pin_x is not None else 0.0,
                pin_y=item.pin_y if item.pin_y is not None else 0.0,
                author=item.author,
                text_comment=item.text_comment,
                video_filename=item.video_filename,
                video_url=f"/media/{item.video_filename}"
                if item.video_filename
                else None,
                photo_filenames=p_names,
                photo_urls=[f"/media/{p}" for p in p_names],
                timestamp=item.timestamp,
                status=item.status,
                is_deleted=item.is_deleted,
            )
        )
    return result


@router.put("/api/v1/feedback/{feedback_id}", response_model=schemas.FeedbackItem)
async def update_feedback_full(
    feedback_id: str,
    page_ref: Optional[int] = Form(None),
    section_ref: Optional[str] = Form(None),
    pin_x: Optional[float] = Form(None),
    pin_y: Optional[float] = Form(None),
    author: Optional[str] = Form(None),
    text_comment: Optional[str] = Form(None),
    existing_photos: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    remove_video: Optional[str] = Form(None),
    photos: List[UploadFile] = File([]),
    db: Session = Depends(get_db),
):
    """Full update for a feedback note (page, pin coords, text, section, author, photos, video)."""
    item = db.query(models.Feedback).filter(models.Feedback.id == feedback_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Feedback item not found")

    if page_ref is not None:
        item.page_ref = page_ref
    if section_ref is not None:
        item.section_ref = section_ref.strip() if section_ref.strip() else None
    if pin_x is not None:
        item.pin_x = pin_x
    if pin_y is not None:
        item.pin_y = pin_y
    if author is not None:
        item.author = author
    if text_comment is not None:
        item.text_comment = text_comment.strip() if text_comment.strip() else None

    current_photos = json.loads(item.photo_filenames) if item.photo_filenames else []
    if existing_photos is not None:
        try:
            kept_names = json.loads(existing_photos)
            final_photos = [p for p in kept_names if p in current_photos]
        except Exception:
            final_photos = list(current_photos)
    else:
        final_photos = list(current_photos)

    for idx, photo in enumerate(photos):
        if photo and photo.filename:
            p_ext = (
                photo.filename.split(".")[-1].lower()
                if "." in photo.filename
                else "jpg"
            )
            p_name = f"{feedback_id}_photo_{int(datetime.now(timezone.utc).timestamp())}_{idx}.{p_ext}"
            p_path = config.MEDIA_DIR / p_name
            content = await photo.read()
            with open(p_path, "wb") as f:
                f.write(content)
            final_photos.append(p_name)

    item.photo_filenames = json.dumps(final_photos)

    if video and video.filename:
        v_ext = (
            video.filename.split(".")[-1].lower() if "." in video.filename else "mp4"
        )
        v_name = f"{feedback_id}_video_{int(datetime.now(timezone.utc).timestamp())}.{v_ext}"
        v_path = config.MEDIA_DIR / v_name
        content = await video.read()
        with open(v_path, "wb") as f:
            f.write(content)
        item.video_filename = v_name
    elif remove_video == "true" or remove_video == "1":
        item.video_filename = None

    db.commit()
    db.refresh(item)

    p_names = json.loads(item.photo_filenames) if item.photo_filenames else []
    return schemas.FeedbackItem(
        id=item.id,
        slot_id=item.slot_id,
        document_id=item.document_id,
        page_ref=item.page_ref,
        section_ref=item.section_ref,
        pin_x=item.pin_x if item.pin_x is not None else 0.0,
        pin_y=item.pin_y if item.pin_y is not None else 0.0,
        author=item.author,
        text_comment=item.text_comment,
        video_filename=item.video_filename,
        video_url=f"/media/{item.video_filename}" if item.video_filename else None,
        photo_filenames=p_names,
        photo_urls=[f"/media/{p}" for p in p_names],
        timestamp=item.timestamp,
        status=item.status,
        is_deleted=item.is_deleted,
    )


@router.patch("/api/v1/feedback/{feedback_id}", response_model=schemas.FeedbackItem)
def update_feedback(
    feedback_id: str,
    update_data: schemas.FeedbackUpdate,
    db: Session = Depends(get_db),
):
    """Update feedback text comment and/or status."""
    item = db.query(models.Feedback).filter(models.Feedback.id == feedback_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Feedback item not found")

    if update_data.text_comment is not None:
        item.text_comment = (
            update_data.text_comment.strip() if update_data.text_comment else None
        )
    if update_data.status is not None:
        item.status = update_data.status

    db.commit()
    db.refresh(item)

    p_names = json.loads(item.photo_filenames) if item.photo_filenames else []
    return schemas.FeedbackItem(
        id=item.id,
        slot_id=item.slot_id,
        document_id=item.document_id,
        page_ref=item.page_ref,
        section_ref=item.section_ref,
        pin_x=item.pin_x if item.pin_x is not None else 0.0,
        pin_y=item.pin_y if item.pin_y is not None else 0.0,
        author=item.author,
        text_comment=item.text_comment,
        video_filename=item.video_filename,
        video_url=f"/media/{item.video_filename}" if item.video_filename else None,
        photo_filenames=p_names,
        photo_urls=[f"/media/{p}" for p in p_names],
        timestamp=item.timestamp,
        status=item.status,
        is_deleted=item.is_deleted,
    )


@router.patch("/api/v1/feedback/{feedback_id}/status")
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


@router.delete("/api/v1/feedback/{feedback_id}")
def delete_feedback(
    feedback_id: str,
    db: Session = Depends(get_db),
):
    """Soft delete feedback note (sets is_deleted=True)."""
    item = db.query(models.Feedback).filter(models.Feedback.id == feedback_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Feedback item not found")

    item.is_deleted = True
    db.commit()
    return {"status": "deleted", "id": item.id, "is_deleted": True}


@router.post("/api/v1/admin/upload/{slot_id}")
async def admin_upload(
    slot_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload or replace a manual for a slot (1-10)."""
    if slot_id < 1 or slot_id > 10:
        raise HTTPException(status_code=400, detail="Slot ID must be between 1 and 10")

    content = await file.read()
    file_size = len(content)
    file_hash = hashlib.md5(content).hexdigest()[:8]
    stored_filename = f"slot_{slot_id}_{file_hash}.pdf"
    file_path = config.MANUALS_DIR / stored_filename

    with open(file_path, "wb") as f:
        f.write(content)

    doc_title = file.filename or f"Manual Slot {slot_id}"

    existing = (
        db.query(models.Document)
        .filter(models.Document.slot_id == slot_id, models.Document.is_live == True)
        .first()
    )
    if existing:
        existing.is_live = False
        existing.obsolescence_date = datetime.now(timezone.utc)

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


@router.get(
    "/api/v1/admin/history/{slot_id}", response_model=List[schemas.DocumentRevision]
)
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


@router.get("/api/v1/documents/{doc_id}", response_model=schemas.DocumentRevision)
def get_document_revision(doc_id: int, db: Session = Depends(get_db)):
    """Retrieve metadata for a specific document revision by its ID."""
    doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document revision not found")
    return schemas.DocumentRevision(
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


@router.get(
    "/api/v1/slots/{slot_id}/revisions/{version}",
    response_model=schemas.DocumentRevision,
)
def get_slot_revision_by_version(
    slot_id: int, version: int, db: Session = Depends(get_db)
):
    """Retrieve metadata for a slot's specific version number."""
    if slot_id < 1 or slot_id > 10:
        raise HTTPException(status_code=400, detail="Slot ID must be between 1 and 10")
    doc = (
        db.query(models.Document)
        .filter(models.Document.slot_id == slot_id, models.Document.version == version)
        .first()
    )
    if not doc:
        raise HTTPException(
            status_code=404, detail=f"Version {version} for slot {slot_id} not found"
        )
    return schemas.DocumentRevision(
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


@router.post("/api/v1/admin/reinstate/{doc_id}")
def reinstate_document(doc_id: int, db: Session = Depends(get_db)):
    """Reinstate an older revision as the live document for its slot."""
    target_doc = db.query(models.Document).filter(models.Document.id == doc_id).first()
    if not target_doc:
        raise HTTPException(status_code=404, detail="Document revision not found")

    now = datetime.now(timezone.utc)
    db.query(models.Document).filter(
        models.Document.slot_id == target_doc.slot_id,
        models.Document.id != target_doc.id,
    ).update({"is_live": False, "obsolescence_date": now})

    target_doc.is_live = True
    target_doc.obsolescence_date = None
    db.commit()
    db.refresh(target_doc)

    return {
        "status": "success",
        "slot_id": target_doc.slot_id,
        "doc_id": target_doc.id,
        "version": target_doc.version,
        "title": target_doc.title,
    }
