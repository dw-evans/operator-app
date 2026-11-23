from sqlalchemy import text
from app.database import create_sqlite_db

engine, SessionLocal, Base, get_db = create_sqlite_db(
    "assembly.db", env_var="DATABASE_URL"
)


def init_instructions_db():
    """Create tables and run lightweight column migrations for assembly.db."""
    from app.apps.instructions import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        cols = [
            r[1] for r in conn.execute(text("PRAGMA table_info(feedback)")).fetchall()
        ]
        if cols and "section_ref" not in cols:
            conn.execute(text("ALTER TABLE feedback ADD COLUMN section_ref VARCHAR"))
        if cols and "pin_x" not in cols:
            conn.execute(text("ALTER TABLE feedback ADD COLUMN pin_x FLOAT DEFAULT 0.0"))
        if cols and "pin_y" not in cols:
            conn.execute(text("ALTER TABLE feedback ADD COLUMN pin_y FLOAT DEFAULT 0.0"))
        if cols and "is_deleted" not in cols:
            conn.execute(
                text("ALTER TABLE feedback ADD COLUMN is_deleted BOOLEAN DEFAULT 0")
            )
        conn.commit()
