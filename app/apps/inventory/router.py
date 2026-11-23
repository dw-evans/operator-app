import csv
import io
from datetime import datetime, timezone
from typing import List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.apps.inventory import models, schemas
from app.apps.inventory.database import get_db

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


def _resolve_common_name(db: Session, name: Optional[str]) -> Optional[int]:
    """Find or create a CommonName record (case-insensitive match on trimmed text)."""
    if name is None:
        return None
    cleaned = name.strip()
    if not cleaned:
        return None
    existing = (
        db.query(models.CommonName)
        .filter(func.lower(models.CommonName.name) == cleaned.lower())
        .first()
    )
    if existing:
        return existing.id
    cn = models.CommonName(name=cleaned)
    db.add(cn)
    db.flush()
    return cn.id


def _batch_to_schema(batch: models.PartBatch) -> schemas.BatchResponse:
    return schemas.BatchResponse(
        id=batch.id,
        part_id=batch.part_id,
        batch_number=batch.batch_number,
        received_date=batch.received_date,
        location=batch.location,
        quantity=batch.quantity,
        batch_status=batch.batch_status,
        notes=batch.notes,
        created_at=batch.created_at,
        updated_at=batch.updated_at,
    )


def _part_to_schema(part: models.InventoryPart) -> schemas.PartResponse:
    batches = [_batch_to_schema(b) for b in part.batches]
    total_active = sum(b.quantity for b in part.batches if b.batch_status == "active")
    total_all = sum(b.quantity for b in part.batches)
    return schemas.PartResponse(
        id=part.id,
        part_number=part.part_number,
        revision=part.revision,
        iteration=part.iteration,
        name=part.name,
        common_name=part.common_name_rel.name if part.common_name_rel else None,
        common_name_id=part.common_name_id,
        description=part.description,
        category=part.category,
        unit=part.unit,
        lifecycle_status=part.lifecycle_status,
        is_archived=part.is_archived,
        total_active_quantity=total_active,
        total_all_quantity=total_all,
        batches=batches,
        created_at=part.created_at,
        updated_at=part.updated_at,
    )


def _tx_to_schema(
    tx: models.InventoryTransaction, reverted_ids: Set[int]
) -> schemas.TransactionResponse:
    part = tx.part
    batch = tx.batch
    return schemas.TransactionResponse(
        id=tx.id,
        batch_id=tx.batch_id,
        part_id=tx.part_id,
        part_number=part.part_number if part else "",
        revision=part.revision if part else "",
        iteration=part.iteration if part else "",
        part_name=part.name if part else "",
        common_name=(
            part.common_name_rel.name if part and part.common_name_rel else None
        ),
        batch_number=batch.batch_number if batch else "",
        delta=tx.delta,
        quantity_before=tx.quantity_before,
        quantity_after=tx.quantity_after,
        reason=tx.reason,
        operator=tx.operator,
        reverts_transaction_id=tx.reverts_transaction_id,
        is_reverted=tx.id in reverted_ids,
        timestamp=tx.timestamp,
    )


@router.get("/common-names", response_model=List[schemas.CommonNameItem])
def list_common_names(db: Session = Depends(get_db)):
    """List all colloquial common names for combobox autocomplete."""
    items = (
        db.query(models.CommonName)
        .order_by(func.lower(models.CommonName.name))
        .all()
    )
    return [schemas.CommonNameItem(id=c.id, name=c.name) for c in items]


@router.get("/parts", response_model=List[schemas.PartResponse])
def list_parts(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    include_obsolete: bool = Query(True),
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
):
    """List inventory part versions with their nested batches."""
    query = db.query(models.InventoryPart).options(
        joinedload(models.InventoryPart.common_name_rel),
        joinedload(models.InventoryPart.batches),
    )

    if not include_archived:
        query = query.filter(models.InventoryPart.is_archived == False)
    if not include_obsolete:
        query = query.filter(models.InventoryPart.lifecycle_status == "active")
    if category and category.strip():
        query = query.filter(models.InventoryPart.category == category.strip())

    parts = query.order_by(
        models.InventoryPart.part_number.asc(),
        models.InventoryPart.revision.desc(),
        models.InventoryPart.iteration.desc(),
    ).all()

    if search and search.strip():
        q = search.strip().lower()
        filtered = []
        for p in parts:
            cn_name = p.common_name_rel.name.lower() if p.common_name_rel else ""
            batch_match = any(
                q in b.batch_number.lower()
                or (b.location and q in b.location.lower())
                for b in p.batches
            )
            if (
                q in p.part_number.lower()
                or q in p.name.lower()
                or q in cn_name
                or (p.category and q in p.category.lower())
                or (p.description and q in p.description.lower())
                or q in p.revision.lower()
                or batch_match
            ):
                filtered.append(p)
        parts = filtered

    return [_part_to_schema(p) for p in parts]


@router.post("/parts", response_model=schemas.PartResponse, status_code=201)
def create_part(payload: schemas.PartCreate, db: Session = Depends(get_db)):
    """Create a new Part Version (and optional initial batch + opening transaction)."""
    common_name_id = _resolve_common_name(db, payload.common_name)

    part = models.InventoryPart(
        part_number=payload.part_number.strip(),
        revision=payload.revision.strip(),
        iteration=(payload.iteration or "").strip(),
        name=payload.name.strip(),
        common_name_id=common_name_id,
        description=payload.description.strip() if payload.description else None,
        category=payload.category.strip() if payload.category else None,
        unit=(payload.unit or "pcs").strip(),
        lifecycle_status=payload.lifecycle_status,
    )
    db.add(part)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                f"Part '{payload.part_number}' Rev '{payload.revision}'"
                f"{f' Iter {payload.iteration}' if payload.iteration else ''} already exists."
            ),
        )

    # Create initial batch if batch number or non-zero quantity was supplied
    if (
        payload.initial_batch_number
        and payload.initial_batch_number.strip()
    ) or payload.initial_quantity != 0:
        batch_num = (
            payload.initial_batch_number.strip()
            if payload.initial_batch_number and payload.initial_batch_number.strip()
            else "INITIAL"
        )
        batch = models.PartBatch(
            part_id=part.id,
            batch_number=batch_num,
            received_date=payload.initial_received_date or None,
            location=payload.initial_location.strip()
            if payload.initial_location
            else None,
            quantity=payload.initial_quantity,
            batch_status="active",
        )
        db.add(batch)
        db.flush()

        if payload.initial_quantity != 0:
            tx = models.InventoryTransaction(
                batch_id=batch.id,
                part_id=part.id,
                delta=payload.initial_quantity,
                quantity_before=0,
                quantity_after=payload.initial_quantity,
                reason="Initial stock",
                operator=payload.operator.strip() or "Operator",
                timestamp=datetime.now(timezone.utc),
            )
            db.add(tx)

    db.commit()
    db.refresh(part)
    return _part_to_schema(part)


@router.get("/parts/{part_id}", response_model=schemas.PartResponse)
def get_part(part_id: int, db: Session = Depends(get_db)):
    part = (
        db.query(models.InventoryPart)
        .options(
            joinedload(models.InventoryPart.common_name_rel),
            joinedload(models.InventoryPart.batches),
        )
        .filter(models.InventoryPart.id == part_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    return _part_to_schema(part)


@router.patch("/parts/{part_id}", response_model=schemas.PartResponse)
def update_part(
    part_id: int, payload: schemas.PartUpdate, db: Session = Depends(get_db)
):
    """Update part metadata or lifecycle_status (active/obsolete)."""
    part = db.query(models.InventoryPart).filter(models.InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    if payload.part_number is not None:
        part.part_number = payload.part_number.strip()
    if payload.revision is not None:
        part.revision = payload.revision.strip()
    if payload.iteration is not None:
        part.iteration = payload.iteration.strip()
    if payload.name is not None:
        part.name = payload.name.strip()
    if payload.common_name is not None:
        part.common_name_id = _resolve_common_name(db, payload.common_name)
    if payload.description is not None:
        part.description = payload.description.strip() or None
    if payload.category is not None:
        part.category = payload.category.strip() or None
    if payload.unit is not None:
        part.unit = payload.unit.strip() or "pcs"
    if payload.lifecycle_status is not None:
        part.lifecycle_status = payload.lifecycle_status
    if payload.is_archived is not None:
        part.is_archived = payload.is_archived

    part.updated_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A part with that Part Number, Revision, and Iteration already exists.",
        )
    db.refresh(part)
    return _part_to_schema(part)


@router.delete("/parts/{part_id}")
def archive_part(part_id: int, db: Session = Depends(get_db)):
    """Soft-archive a part so transaction history remains intact."""
    part = db.query(models.InventoryPart).filter(models.InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    part.is_archived = True
    part.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "archived", "id": part.id}


@router.post(
    "/parts/{part_id}/batches", response_model=schemas.BatchResponse, status_code=201
)
def create_batch(
    part_id: int, payload: schemas.BatchCreate, db: Session = Depends(get_db)
):
    """Add a new received batch/lot under an existing Part Version."""
    part = db.query(models.InventoryPart).filter(models.InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    batch = models.PartBatch(
        part_id=part.id,
        batch_number=payload.batch_number.strip(),
        received_date=payload.received_date or None,
        location=payload.location.strip() if payload.location else None,
        quantity=payload.initial_quantity,
        batch_status=payload.batch_status,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(batch)
    db.flush()

    if payload.initial_quantity != 0:
        tx = models.InventoryTransaction(
            batch_id=batch.id,
            part_id=part.id,
            delta=payload.initial_quantity,
            quantity_before=0,
            quantity_after=payload.initial_quantity,
            reason="Batch received",
            operator=payload.operator.strip() or "Operator",
            timestamp=datetime.now(timezone.utc),
        )
        db.add(tx)

    db.commit()
    db.refresh(batch)
    return _batch_to_schema(batch)


@router.patch("/batches/{batch_id}", response_model=schemas.BatchResponse)
def update_batch(
    batch_id: int, payload: schemas.BatchUpdate, db: Session = Depends(get_db)
):
    """Update batch metadata or status (e.g. flag as non_conformant)."""
    batch = db.query(models.PartBatch).filter(models.PartBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if payload.batch_number is not None:
        batch.batch_number = payload.batch_number.strip()
    if payload.received_date is not None:
        batch.received_date = payload.received_date or None
    if payload.location is not None:
        batch.location = payload.location.strip() or None
    if payload.batch_status is not None:
        batch.batch_status = payload.batch_status
    if payload.notes is not None:
        batch.notes = payload.notes.strip() or None

    batch.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(batch)
    return _batch_to_schema(batch)


@router.post("/batches/{batch_id}/adjust", response_model=schemas.AdjustResponse)
def adjust_batch_stock(
    batch_id: int, payload: schemas.StockAdjustRequest, db: Session = Depends(get_db)
):
    """
    Atomically adjust a batch's integer quantity by an offset (delta) or exact stocktake (set_quantity).
    Negative quantities are allowed so production is never blocked.
    """
    if payload.delta is None and payload.set_quantity is None:
        raise HTTPException(
            status_code=400, detail="Either 'delta' or 'set_quantity' must be provided."
        )

    batch = (
        db.query(models.PartBatch)
        .options(
            joinedload(models.PartBatch.part).joinedload(
                models.InventoryPart.common_name_rel
            )
        )
        .filter(models.PartBatch.id == batch_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    qty_before = batch.quantity
    if payload.set_quantity is not None:
        delta = payload.set_quantity - qty_before
        qty_after = payload.set_quantity
        reason = (payload.reason or "").strip() or "Stocktake count"
    else:
        delta = payload.delta or 0
        qty_after = qty_before + delta
        reason = (payload.reason or "").strip() or (
            "Taken for production" if delta < 0 else "Restock"
        )

    if delta == 0:
        raise HTTPException(
            status_code=400, detail="Adjustment delta is 0; no change recorded."
        )

    batch.quantity = qty_after
    batch.updated_at = datetime.now(timezone.utc)

    tx = models.InventoryTransaction(
        batch_id=batch.id,
        part_id=batch.part_id,
        delta=delta,
        quantity_before=qty_before,
        quantity_after=qty_after,
        reason=reason,
        operator=payload.operator.strip() or "Operator",
        timestamp=datetime.now(timezone.utc),
    )
    db.add(tx)
    db.commit()
    db.refresh(batch)
    db.refresh(tx)

    return schemas.AdjustResponse(
        batch=_batch_to_schema(batch),
        transaction=_tx_to_schema(tx, set()),
    )


@router.post("/transactions/{tx_id}/undo", response_model=schemas.AdjustResponse)
def undo_transaction(
    tx_id: int, payload: schemas.UndoTransactionRequest, db: Session = Depends(get_db)
):
    """
    Undo a previous stock transaction by creating a compensating inverse transaction.
    Preserves full immutable history and prevents double-undoing the same transaction.
    """
    orig = (
        db.query(models.InventoryTransaction)
        .options(
            joinedload(models.InventoryTransaction.batch),
            joinedload(models.InventoryTransaction.part).joinedload(
                models.InventoryPart.common_name_rel
            ),
        )
        .filter(models.InventoryTransaction.id == tx_id)
        .first()
    )
    if not orig:
        raise HTTPException(status_code=404, detail="Transaction not found")

    already_reverted = (
        db.query(models.InventoryTransaction)
        .filter(models.InventoryTransaction.reverts_transaction_id == tx_id)
        .first()
    )
    if already_reverted:
        raise HTTPException(
            status_code=409, detail=f"Transaction #{tx_id} has already been undone."
        )

    batch = orig.batch
    qty_before = batch.quantity
    undo_delta = -orig.delta
    qty_after = qty_before + undo_delta

    batch.quantity = qty_after
    batch.updated_at = datetime.now(timezone.utc)

    comp_tx = models.InventoryTransaction(
        batch_id=batch.id,
        part_id=orig.part_id,
        delta=undo_delta,
        quantity_before=qty_before,
        quantity_after=qty_after,
        reason=f"Undo #{orig.id} ({orig.reason or 'adjustment'})",
        operator=payload.operator.strip() or "Operator",
        reverts_transaction_id=orig.id,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(comp_tx)
    db.commit()
    db.refresh(batch)
    db.refresh(comp_tx)

    return schemas.AdjustResponse(
        batch=_batch_to_schema(batch),
        transaction=_tx_to_schema(comp_tx, set()),
    )


@router.get("/transactions", response_model=List[schemas.TransactionResponse])
def list_transactions(
    part_id: Optional[int] = Query(None),
    batch_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Retrieve chronological audit history of inventory stock changes."""
    query = db.query(models.InventoryTransaction).options(
        joinedload(models.InventoryTransaction.part).joinedload(
            models.InventoryPart.common_name_rel
        ),
        joinedload(models.InventoryTransaction.batch),
    )
    if part_id is not None:
        query = query.filter(models.InventoryTransaction.part_id == part_id)
    if batch_id is not None:
        query = query.filter(models.InventoryTransaction.batch_id == batch_id)

    txs = (
        query.order_by(
            models.InventoryTransaction.timestamp.desc(),
            models.InventoryTransaction.id.desc(),
        )
        .limit(limit)
        .all()
    )

    tx_ids = [t.id for t in txs]
    reverted_ids: Set[int] = set()
    if tx_ids:
        reverted_rows = (
            db.query(models.InventoryTransaction.reverts_transaction_id)
            .filter(models.InventoryTransaction.reverts_transaction_id.in_(tx_ids))
            .all()
        )
        reverted_ids = {r[0] for r in reverted_rows if r[0] is not None}

    return [_tx_to_schema(t, reverted_ids) for t in txs]


@router.get("/export.csv")
def export_inventory_csv(db: Session = Depends(get_db)):
    """Export current parts and batches to CSV."""
    parts = (
        db.query(models.InventoryPart)
        .options(
            joinedload(models.InventoryPart.common_name_rel),
            joinedload(models.InventoryPart.batches),
        )
        .filter(models.InventoryPart.is_archived == False)
        .order_by(models.InventoryPart.part_number.asc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Part Number",
            "Revision",
            "Iteration",
            "Name",
            "Common Name",
            "Category",
            "Lifecycle Status",
            "Batch Number",
            "Received Date",
            "Location",
            "Batch Status",
            "Quantity",
            "Unit",
        ]
    )

    for p in parts:
        cn = p.common_name_rel.name if p.common_name_rel else ""
        if p.batches:
            for b in p.batches:
                writer.writerow(
                    [
                        p.part_number,
                        p.revision,
                        p.iteration,
                        p.name,
                        cn,
                        p.category or "",
                        p.lifecycle_status,
                        b.batch_number,
                        b.received_date or "",
                        b.location or "",
                        b.batch_status,
                        b.quantity,
                        p.unit,
                    ]
                )
        else:
            writer.writerow(
                [
                    p.part_number,
                    p.revision,
                    p.iteration,
                    p.name,
                    cn,
                    p.category or "",
                    p.lifecycle_status,
                    "",
                    "",
                    "",
                    "",
                    0,
                    p.unit,
                ]
            )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="inventory_export.csv"'},
    )
