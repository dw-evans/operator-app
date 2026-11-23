import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import config
from app.main import app
from app.apps.inventory.database import Base as InventoryBase, get_db as get_inventory_db

# Isolated in-memory SQLite DB for inventory tests
inv_test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
InvTestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=inv_test_engine
)


def override_get_inventory_db():
    db = InvTestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_inventory_test_db():
    app.dependency_overrides[get_inventory_db] = override_get_inventory_db
    InventoryBase.metadata.create_all(bind=inv_test_engine)
    yield
    InventoryBase.metadata.drop_all(bind=inv_test_engine)
    app.dependency_overrides.pop(get_inventory_db, None)


client = TestClient(app)


def test_create_parts_with_shared_common_name_and_versions():
    # Create Rev 1 with initial batch
    r1 = client.post(
        "/api/v1/inventory/parts",
        json={
            "part_number": "PN-1042",
            "revision": "1",
            "iteration": "0",
            "name": "Left Side Bracket Alu",
            "common_name": "Left Bracket",
            "category": "Mechanical",
            "description": "Original design",
            "initial_batch_number": "B-2026-01",
            "initial_received_date": "2026-10-01",
            "initial_location": "Bin A-1",
            "initial_quantity": 25,
            "operator": "Alice",
        },
    )
    assert r1.status_code == 201
    p1 = r1.json()
    assert p1["common_name"] == "Left Bracket"
    assert p1["total_active_quantity"] == 25
    assert len(p1["batches"]) == 1
    assert p1["batches"][0]["batch_number"] == "B-2026-01"

    # Create Rev 2 sharing same common name (different casing -> reused)
    r2 = client.post(
        "/api/v1/inventory/parts",
        json={
            "part_number": "PN-1042",
            "revision": "2",
            "iteration": "0",
            "name": "Left Side Bracket Steel",
            "common_name": "left bracket",
            "category": "Mechanical",
            "initial_batch_number": "B-2026-02",
            "initial_received_date": "2026-11-15",
            "initial_quantity": 40,
            "operator": "Bob",
        },
    )
    assert r2.status_code == 201
    p2 = r2.json()
    assert p2["common_name_id"] == p1["common_name_id"]
    assert p2["common_name"] == "Left Bracket"

    # Duplicate (part_number, revision, iteration) rejected with 409
    dup = client.post(
        "/api/v1/inventory/parts",
        json={
            "part_number": "PN-1042",
            "revision": "2",
            "iteration": "0",
            "name": "Duplicate",
        },
    )
    assert dup.status_code == 409

    # Common names endpoint lists single deduplicated entry
    cns = client.get("/api/v1/inventory/common-names").json()
    assert len(cns) == 1
    assert cns[0]["name"] == "Left Bracket"

    # Mark Rev 1 as obsolete and verify include_obsolete=false filters it out
    patch_obs = client.patch(
        f"/api/v1/inventory/parts/{p1['id']}",
        json={"lifecycle_status": "obsolete"},
    )
    assert patch_obs.status_code == 200
    assert patch_obs.json()["lifecycle_status"] == "obsolete"

    active_only = client.get("/api/v1/inventory/parts?include_obsolete=false").json()
    assert len(active_only) == 1
    assert active_only[0]["revision"] == "2"


def test_batches_depleted_negative_offsets_and_undo():
    part = client.post(
        "/api/v1/inventory/parts",
        json={
            "part_number": "M6-BOLT",
            "revision": "1",
            "name": "M6x20 Socket Bolt",
            "common_name": "Frame Bolt",
            "initial_batch_number": "LOT-GOOD",
            "initial_received_date": "2026-11-01",
            "initial_quantity": 10,
            "operator": "Alice",
        },
    ).json()

    good_batch_id = part["batches"][0]["id"]

    # Add second received shipment batch -> adds +20 to top-level part pool
    second_batch = client.post(
        f"/api/v1/inventory/parts/{part['id']}/batches",
        json={
            "batch_number": "LOT-2",
            "received_date": "2026-11-10",
            "location": "Shelf B",
            "initial_quantity": 20,
            "batch_status": "active",
            "notes": "Second shipment",
            "operator": "QA",
        },
    ).json()
    assert second_batch["quantity"] == 20

    # Top-level part stock is now 10 + 20 = 30
    refreshed = client.get(f"/api/v1/inventory/parts/{part['id']}").json()
    assert refreshed["quantity"] == 30
    assert refreshed["total_active_quantity"] == 30

    # Take -35 from top-level part -> goes negative (-5) without blocking production
    adj = client.post(
        f"/api/v1/inventory/parts/{part['id']}/adjust",
        json={
            "delta": -35,
            "reason": "Taken for Line 2",
            "operator": "Charlie",
        },
    )
    assert adj.status_code == 200
    adj_data = adj.json()
    assert adj_data["part"]["quantity"] == -5
    assert adj_data["transaction"]["batch_id"] is None
    assert adj_data["transaction"]["quantity_before"] == 30
    assert adj_data["transaction"]["quantity_after"] == -5
    tx_id = adj_data["transaction"]["id"]

    # Undo the -35 transaction -> restores to +30 with compensating +35 record
    undo = client.post(
        f"/api/v1/inventory/transactions/{tx_id}/undo",
        json={"operator": "Charlie"},
    )
    assert undo.status_code == 200
    undo_data = undo.json()
    assert undo_data["part"]["quantity"] == 30
    assert undo_data["transaction"]["delta"] == 35
    assert undo_data["transaction"]["reverts_transaction_id"] == tx_id

    # Double-undo is prevented with 409 Conflict
    undo_again = client.post(
        f"/api/v1/inventory/transactions/{tx_id}/undo",
        json={"operator": "Charlie"},
    )
    assert undo_again.status_code == 409

    # Ledger marks original transaction as reverted
    txs = client.get(f"/api/v1/inventory/transactions?part_id={part['id']}").json()
    orig_entry = next(t for t in txs if t["id"] == tx_id)
    assert orig_entry["is_reverted"] is True


def test_search_and_csv_export():
    client.post(
        "/api/v1/inventory/parts",
        json={
            "part_number": "PCB-900",
            "revision": "3",
            "iteration": "2",
            "name": "Main Controller Board",
            "common_name": "Brain Board",
            "subassembly": "Payload Bay",
            "category": "Electronics",
            "initial_batch_number": "SMD-44",
            "initial_quantity": 8,
            "operator": "Dana",
        },
    )

    # Subassemblies list & filter
    subs = client.get("/api/v1/inventory/subassemblies").json()
    assert len(subs) == 1
    assert subs[0]["name"] == "Payload Bay"

    res_sub = client.get("/api/v1/inventory/parts?subassembly=Payload%20Bay").json()
    assert len(res_sub) == 1
    assert res_sub[0]["subassembly"] == "Payload Bay"

    res_other = client.get("/api/v1/inventory/parts?subassembly=Leg%20Assembly").json()
    assert len(res_other) == 0

    # Search by colloquial name (exact & typo fuzzy match)
    res_cn = client.get("/api/v1/inventory/parts?search=brain").json()
    assert len(res_cn) == 1
    assert res_cn[0]["part_number"] == "PCB-900"

    res_typo = client.get("/api/v1/inventory/parts?search=bran%20bord").json()
    assert len(res_typo) == 1
    assert res_typo[0]["part_number"] == "PCB-900"

    # Search by subsequence
    res_subseq = client.get("/api/v1/inventory/parts?search=pcb9").json()
    assert len(res_subseq) == 1
    assert res_subseq[0]["part_number"] == "PCB-900"

    # Search by batch number
    res_b = client.get("/api/v1/inventory/parts?search=SMD-44").json()
    assert len(res_b) == 1

    # CSV export
    csv_resp = client.get("/api/v1/inventory/export.csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "PCB-900" in csv_resp.text
    assert "Brain Board" in csv_resp.text
    assert "SMD-44" in csv_resp.text


def test_batch_multiple_photos_upload_and_delete(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MEDIA_DIR", tmp_path)

    part = client.post(
        "/api/v1/inventory/parts",
        json={
            "part_number": "SHP-100",
            "revision": "1",
            "name": "Bracket Shipment Test",
            "initial_batch_number": "LOT-IMG",
            "initial_quantity": 12,
            "operator": "Alice",
        },
    ).json()
    batch_id = part["batches"][0]["id"]

    # Upload 2 photos to batch
    up = client.post(
        f"/api/v1/inventory/batches/{batch_id}/photos",
        files=[
            ("photos", ("box.jpg", io.BytesIO(b"fake-jpg-1"), "image/jpeg")),
            ("photos", ("label.png", io.BytesIO(b"fake-png-2"), "image/png")),
        ],
    )
    assert up.status_code == 200
    b_data = up.json()
    assert len(b_data["photo_filenames"]) == 2
    assert len(b_data["photo_urls"]) == 2
    first_file = b_data["photo_filenames"][0]
    assert (tmp_path / first_file).is_file()

    # Delete first photo
    del_resp = client.delete(f"/api/v1/inventory/batches/{batch_id}/photos/{first_file}")
    assert del_resp.status_code == 200
    after = del_resp.json()
    assert len(after["photo_filenames"]) == 1
    assert first_file not in after["photo_filenames"]
    assert not (tmp_path / first_file).exists()
