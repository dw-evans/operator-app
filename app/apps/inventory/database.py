from sqlalchemy import text
from app.database import create_sqlite_db

engine, SessionLocal, Base, get_db = create_sqlite_db(
    "inventory.db", env_var="INVENTORY_DATABASE_URL"
)


def init_inventory_db():
    """Create all tables for inventory.db and run lightweight schema cleanups."""
    from app.apps.inventory import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Drop legacy is_archived NOT NULL column if present from earlier schema
    with engine.connect() as conn:
        cols = [
            r[1] for r in conn.execute(text("PRAGMA table_info(parts)")).fetchall()
        ]
        if "is_archived" in cols:
            conn.execute(text("DROP INDEX IF EXISTS ix_parts_is_archived"))
            conn.execute(text("ALTER TABLE parts DROP COLUMN is_archived"))
            conn.commit()
