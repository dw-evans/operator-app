from sqlalchemy import text
from app.database import create_sqlite_db

engine, SessionLocal, Base, get_db = create_sqlite_db(
    "inventory.db", env_var="INVENTORY_DATABASE_URL"
)


def init_inventory_db():
    """Create all tables for inventory.db (including quality_issues) and run lightweight schema cleanups."""
    from app.apps.inventory import models  # noqa: F401
    from app.apps.quality import models as quality_models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Lightweight migrations for existing inventory.db
    with engine.connect() as conn:
        part_cols = {
            r[1]: r for r in conn.execute(text("PRAGMA table_info(parts)")).fetchall()
        }
        if "is_archived" in part_cols:
            conn.execute(text("DROP INDEX IF EXISTS ix_parts_is_archived"))
            conn.execute(text("ALTER TABLE parts DROP COLUMN is_archived"))
        if part_cols and "quantity" not in part_cols:
            conn.execute(
                text("ALTER TABLE parts ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0")
            )
            # Backfill part quantity from existing batch totals
            conn.execute(
                text(
                    """
                    UPDATE parts
                    SET quantity = COALESCE(
                        (SELECT SUM(quantity) FROM part_batches WHERE part_batches.part_id = parts.id),
                        0
                    )
                    """
                )
            )
        if part_cols and "subassembly_id" not in part_cols:
            conn.execute(
                text(
                    "ALTER TABLE parts ADD COLUMN subassembly_id INTEGER REFERENCES subassemblies(id) ON DELETE SET NULL"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_parts_subassembly_id ON parts (subassembly_id)"
                )
            )
        if part_cols and "batch_number" not in part_cols:
            conn.execute(
                text("ALTER TABLE parts ADD COLUMN batch_number VARCHAR NOT NULL DEFAULT ''")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_parts_batch_number ON parts (batch_number)")
            )

        batch_cols = [
            r[1] for r in conn.execute(text("PRAGMA table_info(part_batches)")).fetchall()
        ]
        if batch_cols and "photo_filenames" not in batch_cols:
            conn.execute(
                text("ALTER TABLE part_batches ADD COLUMN photo_filenames TEXT")
            )

        qi_cols = [
            r[1]
            for r in conn.execute(text("PRAGMA table_info(quality_issues)")).fetchall()
        ]
        if qi_cols and "status" not in qi_cols:
            conn.execute(
                text(
                    "ALTER TABLE quality_issues ADD COLUMN status VARCHAR NOT NULL DEFAULT 'open'"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_quality_issues_status ON quality_issues (status)"
                )
            )

        # Make inventory_transactions.batch_id nullable so part-level adjustments don't need a batch
        tx_cols = {
            r[1]: r
            for r in conn.execute(
                text("PRAGMA table_info(inventory_transactions)")
            ).fetchall()
        }
        if "batch_id" in tx_cols and tx_cols["batch_id"][3] == 1:  # notnull == 1
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            conn.execute(
                text(
                    """
                    CREATE TABLE inventory_transactions_new (
                        id INTEGER NOT NULL PRIMARY KEY,
                        batch_id INTEGER REFERENCES part_batches(id) ON DELETE SET NULL,
                        part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
                        delta INTEGER NOT NULL,
                        quantity_before INTEGER NOT NULL,
                        quantity_after INTEGER NOT NULL,
                        reason VARCHAR,
                        operator VARCHAR NOT NULL,
                        reverts_transaction_id INTEGER REFERENCES inventory_transactions_new(id) ON DELETE SET NULL,
                        timestamp DATETIME
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO inventory_transactions_new
                        (id, batch_id, part_id, delta, quantity_before, quantity_after,
                         reason, operator, reverts_transaction_id, timestamp)
                    SELECT id, batch_id, part_id, delta, quantity_before, quantity_after,
                           reason, operator, reverts_transaction_id, timestamp
                    FROM inventory_transactions
                    """
                )
            )
            conn.execute(text("DROP TABLE inventory_transactions"))
            conn.execute(
                text(
                    "ALTER TABLE inventory_transactions_new RENAME TO inventory_transactions"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_inventory_transactions_part_id ON inventory_transactions (part_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_inventory_transactions_batch_id ON inventory_transactions (batch_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_inventory_transactions_timestamp ON inventory_transactions (timestamp)"
                )
            )
            conn.execute(text("PRAGMA foreign_keys=ON"))

        conn.commit()
