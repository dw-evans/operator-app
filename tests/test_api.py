import io
import json
import pytest
from fastapi.testclient import TestClient
from main import app
from database import Base, engine

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_db():
    # Recreate tables before each test
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def test_empty_manifest_and_slots():
    # Manifest should support GET and HEAD
    head_resp = client.head("/api/v1/manifest")
    assert head_resp.status_code == 200

    head_health = client.head("/api/v1/health")
    assert head_health.status_code == 200

    resp = client.get("/api/v1/manifest")
    assert resp.status_code == 200
    data = resp.json()
    assert data["documents"] == []

    # Slots summary should return 10 slots
    resp = client.get("/api/v1/slots")
    assert resp.status_code == 200
    slots = resp.json()
    assert len(slots) == 10
    assert slots[0]["slot_id"] == 1
    assert slots[0]["live_document"] is None
    assert slots[0]["total_feedback"] == 0


def test_admin_upload_and_versioning():
    pdf_content_v1 = b"%PDF-1.4 Mock PDF content version 1"
    file_v1 = ("test_manual.pdf", io.BytesIO(pdf_content_v1), "application/pdf")

    # Upload version 1 for slot 1
    resp = client.post(
        "/api/v1/admin/upload/1",
        files={"file": file_v1},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["slot_id"] == 1
    assert data["version"] == 1
    assert data["title"] == "test_manual.pdf"

    # Manifest should now contain slot 1
    manifest_resp = client.get("/api/v1/manifest")
    assert manifest_resp.status_code == 200
    m_docs = manifest_resp.json()["documents"]
    assert len(m_docs) == 1
    assert m_docs[0]["slot_id"] == 1
    assert m_docs[0]["version"] == 1
    assert m_docs[0]["title"] == "test_manual.pdf"

    # Upload version 2 for slot 1
    pdf_content_v2 = b"%PDF-1.4 Mock PDF content version 2 updated"
    file_v2 = ("test_manual_v2.pdf", io.BytesIO(pdf_content_v2), "application/pdf")

    resp2 = client.post(
        "/api/v1/admin/upload/1",
        files={"file": file_v2},
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["version"] == 2
    assert data2["title"] == "test_manual_v2.pdf"

    # Check history endpoint
    hist_resp = client.get("/api/v1/admin/history/1")
    assert hist_resp.status_code == 200
    history = hist_resp.json()
    assert len(history) == 2
    # Newest version first
    assert history[0]["version"] == 2
    assert history[0]["is_live"] is True
    assert history[0]["obsolescence_date"] is None
    assert history[1]["version"] == 1
    assert history[1]["is_live"] is False
    assert history[1]["obsolescence_date"] is not None


def test_admin_upload_file_only():
    pdf_content = b"%PDF-1.4 Assembly Spec Sheet"
    file = ("Assembly_Spec_Sheet.pdf", io.BytesIO(pdf_content), "application/pdf")
    resp = client.post(
        "/api/v1/admin/upload/5",
        files={"file": file},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["slot_id"] == 5
    assert data["title"] == "Assembly_Spec_Sheet.pdf"


def test_feedback_submission_and_status():
    # Setup document in slot 2
    pdf_content = b"%PDF-1.4 Motor manual"
    client.post(
        "/api/v1/admin/upload/2",
        files={"file": ("motor.pdf", io.BytesIO(pdf_content), "application/pdf")},
    )

    # Submit feedback with photo and video
    mock_photo = ("part.jpg", io.BytesIO(b"fake image data"), "image/jpeg")
    mock_video = ("clip.mp4", io.BytesIO(b"fake video data"), "video/mp4")

    fb_id = "fb-uuid-12345"
    resp = client.post(
        "/api/v1/feedback",
        data={
            "id": fb_id,
            "station_id": "Station 3",
            "slot_id": 2,
            "page_ref": 4,
            "author": "John Doe",
            "text_comment": "Screw alignment difficult on step 4",
        },
        files=[("photos", mock_photo), ("video", mock_video)],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    # Retrieve slot feedback
    fb_list_resp = client.get("/api/v1/feedback/2")
    assert fb_list_resp.status_code == 200
    fb_list = fb_list_resp.json()
    assert len(fb_list) == 1
    item = fb_list[0]
    assert item["id"] == fb_id
    assert item["station_id"] == "Station 3"
    assert item["page_ref"] == 4
    assert item["author"] == "John Doe"
    assert item["text_comment"] == "Screw alignment difficult on step 4"
    assert item["status"] == "open"
    assert item["video_filename"] is not None
    assert len(item["photo_filenames"]) == 1

    # Update feedback status
    patch_resp = client.patch(
        f"/api/v1/feedback/{fb_id}/status",
        json={"status": "reviewed"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["new_status"] == "reviewed"

    # Check updated status
    fb_list_resp2 = client.get("/api/v1/feedback/2")
    assert fb_list_resp2.json()[0]["status"] == "reviewed"


def test_feedback_idempotency():
    # Sending the same feedback ID twice should succeed gracefully (for offline retry sync)
    fb_id = "idem-uuid-999"
    resp1 = client.post(
        "/api/v1/feedback",
        data={
            "id": fb_id,
            "station_id": "Station 1",
            "slot_id": 1,
            "page_ref": 1,
            "author": "Alice",
            "text_comment": "Testing retry",
        },
    )
    assert resp1.status_code == 200

    resp2 = client.post(
        "/api/v1/feedback",
        data={
            "id": fb_id,
            "station_id": "Station 1",
            "slot_id": 1,
            "page_ref": 1,
            "author": "Alice",
            "text_comment": "Testing retry",
        },
    )
    assert resp2.status_code == 200
    assert "already recorded" in resp2.json().get("message", "")


def test_invalid_slot_validation():
    resp_low = client.post(
        "/api/v1/admin/upload/0",
        files={"file": ("test.pdf", io.BytesIO(b"data"), "application/pdf")},
    )
    assert resp_low.status_code == 400

    resp_high = client.post(
        "/api/v1/admin/upload/11",
        files={"file": ("test.pdf", io.BytesIO(b"data"), "application/pdf")},
    )
    assert resp_high.status_code == 400


def test_admin_pin_verification(monkeypatch):
    # When ADMIN_PIN is not set
    monkeypatch.delenv("ADMIN_PIN", raising=False)
    status_resp = client.get("/api/v1/admin/pin-status")
    assert status_resp.status_code == 200
    assert status_resp.json()["pin_required"] is False
    assert status_resp.json()["valid"] is True

    verify_resp = client.post("/api/v1/admin/verify-pin", json={"pin": ""})
    assert verify_resp.json()["valid"] is True

    # When ADMIN_PIN is set
    monkeypatch.setenv("ADMIN_PIN", "4321")
    status_resp2 = client.get("/api/v1/admin/pin-status")
    assert status_resp2.json()["pin_required"] is True
    assert status_resp2.json()["valid"] is False

    wrong_resp = client.post("/api/v1/admin/verify-pin", json={"pin": "0000"})
    assert wrong_resp.json()["valid"] is False

    correct_resp = client.post("/api/v1/admin/verify-pin", json={"pin": "4321"})
    assert correct_resp.json()["valid"] is True


def test_static_pwa_serving():
    resp_root = client.get("/")
    assert resp_root.status_code == 200
    assert "Assembly Station Instructions & Feedback" in resp_root.text

    resp_sw = client.get("/sw.js")
    assert resp_sw.status_code == 200

    resp_manifest = client.get("/manifest.webmanifest")
    assert resp_manifest.status_code == 200

    # SPA routing fallback
    resp_spa = client.get("/admin/history/1")
    assert resp_spa.status_code == 200
    assert "Assembly Station Instructions & Feedback" in resp_spa.text

    # Missing manual/media files must return 404, NEVER index.html fallback
    resp_bad_manual = client.get("/manuals/non_existent_file.pdf")
    assert resp_bad_manual.status_code == 404
    assert "Assembly Station Instructions & Feedback" not in resp_bad_manual.text



