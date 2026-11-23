import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app import config
from app.apps.inventory.database import get_db
from app.apps.inventory.models import InventoryPart, PartBatch
from app.apps.quality import models, schemas

router = APIRouter(prefix="/api/v1/quality", tags=["quality"])

QUALITY_MEDIA_SUBDIR = "quality"


def _issue_to_schema(issue: models.QualityIssue) -> schemas.QualityIssueResponse:
    part = issue.part
    batch = issue.batch
    p_names = json.loads(issue.photo_filenames) if issue.photo_filenames else []
    return schemas.QualityIssueResponse(
        id=issue.id,
        part_id=issue.part_id,
        part_batch_id=issue.part_batch_id,
        part_name=part.name if part else "",
        common_name=part.common_name_rel.name if part and part.common_name_rel else None,
        part_number=part.part_number if part else "",
        revision=part.revision if part else "",
        iteration=part.iteration if part else "",
        batch_number=(part.batch_number or "") if part else "",
        batch_code=batch.batch_number if batch else None,
        subassembly=part.subassembly_rel.name if part and part.subassembly_rel else None,
        category=part.category if part else None,
        description=issue.description,
        photo_filenames=p_names,
        photo_urls=[f"/media/{p}" for p in p_names],
        operator=issue.operator,
        created_at=issue.created_at,
        updated_at=issue.updated_at,
    )


def _load_issue_with_relations(db: Session, issue_id: int) -> models.QualityIssue | None:
    return (
        db.query(models.QualityIssue)
        .options(
            joinedload(models.QualityIssue.part).joinedload(InventoryPart.common_name_rel),
            joinedload(models.QualityIssue.part).joinedload(InventoryPart.subassembly_rel),
            joinedload(models.QualityIssue.batch),
        )
        .filter(models.QualityIssue.id == issue_id)
        .first()
    )


def _delete_photo_file(rel_path: str) -> None:
    """Safely delete a stored quality photo under MEDIA_DIR."""
    try:
        target = (config.MEDIA_DIR / rel_path).resolve()
        media_root = config.MEDIA_DIR.resolve()
        if str(target).startswith(str(media_root)) and target.is_file():
            target.unlink()
    except OSError:
        pass


@router.get("/issues", response_model=List[schemas.QualityIssueResponse])
def list_quality_issues(db: Session = Depends(get_db)):
    """List all quality issues, newest first."""
    issues = (
        db.query(models.QualityIssue)
        .options(
            joinedload(models.QualityIssue.part).joinedload(InventoryPart.common_name_rel),
            joinedload(models.QualityIssue.part).joinedload(InventoryPart.subassembly_rel),
            joinedload(models.QualityIssue.batch),
        )
        .order_by(models.QualityIssue.created_at.desc(), models.QualityIssue.id.desc())
        .all()
    )
    return [_issue_to_schema(issue) for issue in issues]


@router.post("/issues", response_model=schemas.QualityIssueResponse)
def create_quality_issue(
    payload: schemas.QualityIssueCreate,
    db: Session = Depends(get_db),
):
    """Create a new quality issue tied to an Inventory part and optional shipment batch."""
    description = payload.description.strip()
    if not description:
        raise HTTPException(status_code=400, detail="Description is required.")

    part = db.query(InventoryPart).filter(InventoryPart.id == payload.part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Selected inventory part not found.")

    batch_id = payload.part_batch_id
    if batch_id is not None:
        batch = (
            db.query(PartBatch)
            .filter(PartBatch.id == batch_id, PartBatch.part_id == part.id)
            .first()
        )
        if not batch:
            raise HTTPException(
                status_code=404,
                detail="Selected shipment batch not found for this part.",
            )

    now = datetime.now(timezone.utc)
    issue = models.QualityIssue(
        part_id=part.id,
        part_batch_id=batch_id,
        description=description,
        photo_filenames=json.dumps([]),
        operator=payload.operator.strip() or "Operator",
        created_at=now,
        updated_at=now,
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)

    loaded = _load_issue_with_relations(db, issue.id)
    assert loaded is not None
    return _issue_to_schema(loaded)


@router.patch("/issues/{issue_id}", response_model=schemas.QualityIssueResponse)
def update_quality_issue(
    issue_id: int,
    payload: schemas.QualityIssueUpdate,
    db: Session = Depends(get_db),
):
    """Update a quality issue's description or optional shipment batch association."""
    issue = _load_issue_with_relations(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Quality issue not found.")

    if payload.description is not None:
        cleaned = payload.description.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Description cannot be empty.")
        issue.description = cleaned

    if payload.clear_batch:
        issue.part_batch_id = None
    elif payload.part_batch_id is not None:
        batch = (
            db.query(PartBatch)
            .filter(
                PartBatch.id == payload.part_batch_id,
                PartBatch.part_id == issue.part_id,
            )
            .first()
        )
        if not batch:
            raise HTTPException(
                status_code=404,
                detail="Selected shipment batch not found for this part.",
            )
        issue.part_batch_id = batch.id

    issue.updated_at = datetime.now(timezone.utc)
    db.commit()

    reloaded = _load_issue_with_relations(db, issue.id)
    assert reloaded is not None
    return _issue_to_schema(reloaded)


@router.delete("/issues/{issue_id}")
def delete_quality_issue(issue_id: int, db: Session = Depends(get_db)):
    """Delete a quality issue and any attached photo files."""
    issue = (
        db.query(models.QualityIssue)
        .filter(models.QualityIssue.id == issue_id)
        .first()
    )
    if not issue:
        raise HTTPException(status_code=404, detail="Quality issue not found.")

    photo_names = json.loads(issue.photo_filenames) if issue.photo_filenames else []
    db.delete(issue)
    db.commit()

    for rel_path in photo_names:
        _delete_photo_file(rel_path)

    return {"deleted": True, "id": issue_id}


@router.post("/issues/{issue_id}/photos", response_model=schemas.QualityIssueResponse)
async def upload_quality_issue_photos(
    issue_id: int,
    photos: List[UploadFile] = File([]),
    db: Session = Depends(get_db),
):
    """Upload one or more photos attached to a quality issue."""
    issue = _load_issue_with_relations(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Quality issue not found.")

    quality_dir = config.MEDIA_DIR / QUALITY_MEDIA_SUBDIR
    quality_dir.mkdir(parents=True, exist_ok=True)

    current_photos = json.loads(issue.photo_filenames) if issue.photo_filenames else []
    ts = int(datetime.now(timezone.utc).timestamp() * 1000)

    for idx, photo in enumerate(photos):
        if not photo.filename:
            continue
        ext = Path(photo.filename).suffix.lower()
        if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"}:
            ext = ".jpg"
        safe_stem = re.sub(r"[^a-zA-Z0-9_-]", "_", Path(photo.filename).stem)[:32]
        filename = f"qi_{issue_id}_{ts}_{idx}_{safe_stem}{ext}"
        dest = quality_dir / filename
        content = await photo.read()
        if not content:
            continue
        dest.write_bytes(content)
        current_photos.append(f"{QUALITY_MEDIA_SUBDIR}/{filename}")

    issue.photo_filenames = json.dumps(current_photos)
    issue.updated_at = datetime.now(timezone.utc)
    db.commit()

    reloaded = _load_issue_with_relations(db, issue.id)
    assert reloaded is not None
    return _issue_to_schema(reloaded)


@router.delete(
    "/issues/{issue_id}/photos/{filename:path}",
    response_model=schemas.QualityIssueResponse,
)
def delete_quality_issue_photo(
    issue_id: int,
    filename: str,
    db: Session = Depends(get_db),
):
    """Remove a single photo attached to a quality issue."""
    issue = _load_issue_with_relations(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Quality issue not found.")

    current_photos = json.loads(issue.photo_filenames) if issue.photo_filenames else []
    if filename not in current_photos:
        raise HTTPException(status_code=404, detail="Photo not found on this issue.")

    current_photos = [p for p in current_photos if p != filename]
    issue.photo_filenames = json.dumps(current_photos)
    issue.updated_at = datetime.now(timezone.utc)
    db.commit()

    _delete_photo_file(filename)

    reloaded = _load_issue_with_relations(db, issue.id)
    assert reloaded is not None
    return _issue_to_schema(reloaded)
