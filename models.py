from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    slot_id = Column(Integer, index=True, nullable=False)  # Slots 1 through 10
    title = Column(String, nullable=False)
    filename = Column(String, nullable=False)  # Stored filename in storage/manuals
    original_filename = Column(String, nullable=False)
    file_hash = Column(String, nullable=False)
    file_size = Column(Integer, default=0)
    version = Column(Integer, default=1)
    is_live = Column(Boolean, default=True)
    upload_date = Column(DateTime, default=datetime.utcnow)
    obsolescence_date = Column(DateTime, nullable=True)

    feedback = relationship("Feedback", back_populates="document")

class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(String, primary_key=True)  # Client-generated UUID
    station_id = Column(String, nullable=False)
    slot_id = Column(Integer, index=True, nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    page_ref = Column(Integer, nullable=False)
    author = Column(String, nullable=False)
    text_comment = Column(Text, nullable=True)
    video_filename = Column(String, nullable=True)
    photo_filenames = Column(Text, nullable=True)  # JSON-encoded list of photo filenames
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="open")  # open, reviewed, resolved

    document = relationship("Document", back_populates="feedback")
