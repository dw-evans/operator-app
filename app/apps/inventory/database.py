from app.database import create_sqlite_db

engine, SessionLocal, Base, get_db = create_sqlite_db(
    "inventory.db", env_var="INVENTORY_DATABASE_URL"
)


def init_inventory_db():
    """Create all tables for inventory.db."""
    from app.apps.inventory import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
