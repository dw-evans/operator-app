from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.apps.inventory.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class CommonName(Base):
    """Colloquial shop-floor name shared across revisions of a part."""

    __tablename__ = "common_names"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    parts = relationship("InventoryPart", back_populates="common_name_rel")


class Subassembly(Base):
    """Subassembly group that parts belong to."""

    __tablename__ = "subassemblies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    parts = relationship("InventoryPart", back_populates="subassembly_rel")


class InventoryPart(Base):
    """A specific Part Number + Design Revision + Iteration."""

    __tablename__ = "parts"
    __table_args__ = (
        UniqueConstraint(
            "part_number", "revision", "iteration", name="uq_part_number_rev_iter"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    part_number = Column(String, index=True, nullable=False)
    revision = Column(String, nullable=False, default="1")
    iteration = Column(String, nullable=False, default="")
    batch_number = Column(String, nullable=False, default="", index=True)
    name = Column(String, nullable=False)
    common_name_id = Column(
        Integer, ForeignKey("common_names.id", ondelete="SET NULL"), nullable=True
    )
    subassembly_id = Column(
        Integer,
        ForeignKey("subassemblies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    description = Column(Text, nullable=True)
    category = Column(String, index=True, nullable=True)
    unit = Column(String, nullable=False, default="")
    quantity = Column(Integer, nullable=False, default=0)  # Top-level stock pool (negatives allowed)
    lifecycle_status = Column(
        String, nullable=False, default="active", index=True
    )  # active | obsolete
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    common_name_rel = relationship("CommonName", back_populates="parts")
    subassembly_rel = relationship("Subassembly", back_populates="parts")
    batches = relationship(
        "PartBatch",
        back_populates="part",
        cascade="all, delete-orphan",
        order_by="PartBatch.received_date.desc(), PartBatch.id.desc()",
    )
    transactions = relationship("InventoryTransaction", back_populates="part")


class PartBatch(Base):
    """A received lot/batch of a specific Part Version."""

    __tablename__ = "part_batches"

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(
        Integer,
        ForeignKey("parts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    batch_number = Column(String, index=True, nullable=False)
    received_date = Column(String, nullable=True)  # ISO YYYY-MM-DD
    location = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False, default=0)  # Negatives allowed
    batch_status = Column(
        String, nullable=False, default="active", index=True
    )  # active | depleted
    notes = Column(Text, nullable=True)
    photo_filenames = Column(Text, nullable=True)  # JSON-encoded list of photo filenames
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    part = relationship("InventoryPart", back_populates="batches")
    transactions = relationship("InventoryTransaction", back_populates="batch")


class InventoryTransaction(Base):
    """Immutable append-only ledger of all stock changes & undos."""

    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(
        Integer,
        ForeignKey("part_batches.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    part_id = Column(
        Integer,
        ForeignKey("parts.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    delta = Column(Integer, nullable=False)
    quantity_before = Column(Integer, nullable=False)
    quantity_after = Column(Integer, nullable=False)
    reason = Column(String, nullable=True)
    operator = Column(String, nullable=False)
    reverts_transaction_id = Column(
        Integer,
        ForeignKey("inventory_transactions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    timestamp = Column(DateTime, default=_utcnow, index=True)

    batch = relationship("PartBatch", back_populates="transactions")
    part = relationship("InventoryPart", back_populates="transactions")
