from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.apps.inventory.database import Base
from app.apps.inventory.models import InventoryPart, PartBatch


def _utcnow():
    return datetime.now(timezone.utc)


class QualityIssue(Base):
    """Operator-reported quality issue linked to an Inventory part (and optionally a shipment batch)."""

    __tablename__ = "quality_issues"

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(
        Integer,
        ForeignKey("parts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    part_batch_id = Column(
        Integer,
        ForeignKey("part_batches.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    description = Column(Text, nullable=False)
    photo_filenames = Column(Text, nullable=True)  # JSON-encoded list of relative paths under MEDIA_DIR
    operator = Column(String, nullable=False, default="Operator")
    created_at = Column(DateTime, default=_utcnow, index=True)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    part = relationship(InventoryPart)
    batch = relationship(PartBatch)
