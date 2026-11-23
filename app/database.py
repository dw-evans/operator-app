import os
from typing import Optional
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import BASE_DIR


def create_sqlite_db(db_filename: str, env_var: Optional[str] = None):
    """
    Factory that creates an isolated SQLite (WAL mode + FK enabled) engine,
    SessionLocal, declarative Base, and FastAPI get_db dependency for a sub-app.
    """
    default_url = f"sqlite:///{BASE_DIR / db_filename}"
    database_url = os.environ.get(env_var, default_url) if env_var else default_url

    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False}
        if database_url.startswith("sqlite")
        else {},
    )

    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()

    def get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    return engine, SessionLocal, Base, get_db
