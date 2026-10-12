import io
import json
import pytest
from fastapi.testclient import TestClient
import main
from database import Base, get_db
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# In-memory SQLite for tests to completely isolate tests from production assembly.db
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

main.app.dependency_overrides[get_db] = override_get_db
client = TestClient(main.app)


@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch, tmp_path):
    # Set up tables in isolated test database
    Base.metadata.create_all(bind=test_engine)

    # Use temporary isolated storage folders so tests don't touch production storage
    test_manuals = tmp_path / "manuals"
    test_media = tmp_path / "media"
    test_manuals.mkdir(parents=True, exist_ok=True)
    test_media.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(main, "MANUALS_DIR", test_manuals)
    monkeypatch.setattr(main, "MEDIA_DIR", test_media)

    yield

    Base.metadata.drop_all(bind=test_engine)


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

    # Edit feedback comment text
    edit_resp = client.patch(
        f"/api/v1/feedback/{fb_id}",
        json={"text_comment": "Updated comment: screw alignment resolved with torque wrench"},
    )
    assert edit_resp.status_code == 200
    assert edit_resp.json()["text_comment"] == "Updated comment: screw alignment resolved with torque wrench"

    # Verify updated comment persists in list
    fb_list_resp3 = client.get("/api/v1/feedback/2")
    assert fb_list_resp3.json()[0]["text_comment"] == "Updated comment: screw alignment resolved with torque wrench"

    # Full update of feedback note (page, pin coords, section, comment, new photo, remove video)
    new_mock_photo = ("new_part.jpg", io.BytesIO(b"new fake image data"), "image/jpeg")
    put_resp = client.put(
        f"/api/v1/feedback/{fb_id}",
        data={
            "page_ref": 5,
            "section_ref": "3.2",
            "pin_x": 42.5,
            "pin_y": 78.1,
            "author": "Jane Doe",
            "text_comment": "Fully modified note with new pin and page",
            "remove_video": "true",
        },
        files=[("photos", new_mock_photo)],
    )
    assert put_resp.status_code == 200
    updated_data = put_resp.json()
    assert updated_data["page_ref"] == 5
    assert updated_data["section_ref"] == "3.2"
    assert updated_data["pin_x"] == 42.5
    assert updated_data["pin_y"] == 78.1
    assert updated_data["author"] == "Jane Doe"
    assert updated_data["text_comment"] == "Fully modified note with new pin and page"
    assert updated_data["video_filename"] is None  # Removed video
    assert len(updated_data["photo_filenames"]) == 2  # Kept previous + 1 new


def test_feedback_idempotency():
    # Sending the same feedback ID twice should succeed gracefully (for offline retry sync)
    fb_id = "idem-uuid-999"
    resp1 = client.post(
        "/api/v1/feedback",
        data={
            "id": fb_id,
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
            "slot_id": 1,
            "page_ref": 1,
            "author": "Alice",
            "text_comment": "Testing retry",
        },
    )
    assert resp2.status_code == 200
    assert "already recorded" in resp2.json().get("message", "")


def test_feedback_section_ref():
    fb_id = "sec-ref-uuid-101"
    resp = client.post(
        "/api/v1/feedback",
        data={
            "id": fb_id,
            "slot_id": 3,
            "page_ref": 5,
            "section_ref": "1.4",
            "author": "Bob",
            "text_comment": "Torque spec on section 1.4 unclear",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    fb_list = client.get("/api/v1/feedback/3").json()
    assert len(fb_list) == 1
    assert fb_list[0]["id"] == fb_id
    assert fb_list[0]["page_ref"] == 5
    assert fb_list[0]["section_ref"] == "1.4"
    assert fb_list[0]["author"] == "Bob"
    # When omitted, pins default to 0.0
    assert fb_list[0]["pin_x"] == 0.0
    assert fb_list[0]["pin_y"] == 0.0


def test_feedback_pin_coordinates():
    fb_id = "pin-uuid-202"
    resp = client.post(
        "/api/v1/feedback",
        data={
            "id": fb_id,
            "slot_id": 4,
            "page_ref": 2,
            "section_ref": "2.1",
            "pin_x": 42.5,
            "pin_y": 68.0,
            "author": "Charlie",
            "text_comment": "Inspect clamp bolt here",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    fb_list = client.get("/api/v1/feedback/4").json()
    assert len(fb_list) == 1
    item = fb_list[0]
    assert item["id"] == fb_id
    assert item["page_ref"] == 2
    assert item["pin_x"] == 42.5
    assert item["pin_y"] == 68.0


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


def test_admin_reinstate_old_version():
    # Upload v1 for slot 3
    resp_v1 = client.post(
        "/api/v1/admin/upload/3",
        files={"file": ("manual_v1.pdf", io.BytesIO(b"%PDF-1.4 v1"), "application/pdf")},
    )
    assert resp_v1.status_code == 200

    hist = client.get("/api/v1/admin/history/3").json()
    assert len(hist) == 1
    v1_id = hist[0]["id"]
    assert hist[0]["is_live"] is True

    # Upload v2 for slot 3
    resp_v2 = client.post(
        "/api/v1/admin/upload/3",
        files={"file": ("manual_v2.pdf", io.BytesIO(b"%PDF-1.4 v2"), "application/pdf")},
    )
    assert resp_v2.status_code == 200

    hist2 = client.get("/api/v1/admin/history/3").json()
    assert len(hist2) == 2
    assert hist2[0]["version"] == 2
    assert hist2[0]["is_live"] is True
    assert hist2[1]["version"] == 1
    assert hist2[1]["is_live"] is False

    # Reinstate v1
    reinstate_resp = client.post(f"/api/v1/admin/reinstate/{v1_id}")
    assert reinstate_resp.status_code == 200
    assert reinstate_resp.json()["version"] == 1

    # Check history after reinstate
    hist3 = client.get("/api/v1/admin/history/3").json()
    assert hist3[0]["version"] == 2
    assert hist3[0]["is_live"] is False
    assert hist3[1]["version"] == 1
    assert hist3[1]["is_live"] is True

    # Manifest should report version 1 as live
    manifest = client.get("/api/v1/manifest").json()
    s3_doc = next(d for d in manifest["documents"] if d["slot_id"] == 3)
    assert s3_doc["version"] == 1


def test_version_specific_feedback():
    # Upload v1 for slot 4
    client.post(
        "/api/v1/admin/upload/4",
        files={"file": ("part_v1.pdf", io.BytesIO(b"%PDF-1.4 v1"), "application/pdf")},
    )
    h1 = client.get("/api/v1/admin/history/4").json()
    doc1_id = h1[0]["id"]

    # Submit feedback on v1
    resp_fb1 = client.post(
        "/api/v1/feedback",
        data={
            "id": "fb-v1-note",
            "slot_id": 4,
            "document_id": doc1_id,
            "page_ref": 1,
            "author": "Operator 1",
            "text_comment": "Note for version 1",
        },
    )
    assert resp_fb1.status_code == 200

    # Upload v2 for slot 4
    client.post(
        "/api/v1/admin/upload/4",
        files={"file": ("part_v2.pdf", io.BytesIO(b"%PDF-1.4 v2"), "application/pdf")},
    )
    h2 = client.get("/api/v1/admin/history/4").json()
    doc2_id = h2[0]["id"]

    # Submit feedback on v2
    resp_fb2 = client.post(
        "/api/v1/feedback",
        data={
            "id": "fb-v2-note",
            "slot_id": 4,
            "document_id": doc2_id,
            "page_ref": 2,
            "author": "Operator 2",
            "text_comment": "Note for version 2",
        },
    )
    assert resp_fb2.status_code == 200

    # Filter feedback by v1 doc_id
    v1_notes = client.get(f"/api/v1/feedback/4?document_id={doc1_id}").json()
    assert len(v1_notes) == 1
    assert v1_notes[0]["id"] == "fb-v1-note"
    assert v1_notes[0]["text_comment"] == "Note for version 1"

    # Filter feedback by v2 doc_id
    v2_notes = client.get(f"/api/v1/feedback/4?document_id={doc2_id}").json()
    assert len(v2_notes) == 1
    assert v2_notes[0]["id"] == "fb-v2-note"
    assert v2_notes[0]["text_comment"] == "Note for version 2"

    # Unfiltered returns all notes for slot 4
    all_notes = client.get("/api/v1/feedback/4").json()
    assert len(all_notes) == 2

    # Slot summary note count must reflect current live document (v2 has 1 note)
    slots = client.get("/api/v1/slots").json()
    slot4 = next(s for s in slots if s["slot_id"] == 4)
    assert slot4["total_feedback"] == 1
    assert slot4["live_document"]["version"] == 2

    # Reinstate v1 -> Slot summary note count must reflect reinstated live document (v1 has 1 note)
    reinstate_resp = client.post(f"/api/v1/admin/reinstate/{doc1_id}")
    assert reinstate_resp.status_code == 200
    slots_after = client.get("/api/v1/slots").json()
    slot4_after = next(s for s in slots_after if s["slot_id"] == 4)
    assert slot4_after["total_feedback"] == 1
    assert slot4_after["live_document"]["version"] == 1


def test_soft_delete_feedback():
    # Submit feedback
    resp = client.post(
        "/api/v1/feedback",
        data={
            "id": "fb-soft-del-test",
            "slot_id": 5,
            "page_ref": 1,
            "author": "Operator",
            "text_comment": "This will be soft deleted",
        },
    )
    assert resp.status_code == 200

    # Verify present
    notes = client.get("/api/v1/feedback/5").json()
    assert len(notes) == 1
    assert notes[0]["id"] == "fb-soft-del-test"

    # Soft delete via DELETE /api/v1/feedback/{id}
    del_resp = client.delete("/api/v1/feedback/fb-soft-del-test")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "deleted"
    assert del_resp.json()["is_deleted"] is True

    # Verify no longer returned in get_slot_feedback
    notes_after = client.get("/api/v1/feedback/5").json()
    assert len(notes_after) == 0

    # Verify in DB that row is still present with is_deleted == True (soft delete)
    db = TestingSessionLocal()
    try:
        item = db.query(main.models.Feedback).filter(main.models.Feedback.id == "fb-soft-del-test").first()
        assert item is not None
        assert item.is_deleted is True
    finally:
        db.close()


def test_get_document_revision():
    # Upload a document to slot 6
    up_resp = client.post(
        "/api/v1/admin/upload/6",
        files={"file": ("manual_slot6.pdf", io.BytesIO(b"%PDF-1.4 test slot 6"), "application/pdf")},
    )
    assert up_resp.status_code == 200

    history = client.get("/api/v1/admin/history/6").json()
    assert len(history) >= 1
    doc_id = history[0]["id"]
    version = history[0]["version"]

    # Test GET /api/v1/documents/{doc_id}
    resp = client.get(f"/api/v1/documents/{doc_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == doc_id
    assert data["slot_id"] == 6

    # Test GET /api/v1/slots/6/revisions/{version}
    resp_v = client.get(f"/api/v1/slots/6/revisions/{version}")
    assert resp_v.status_code == 200
    assert resp_v.json()["id"] == doc_id
    assert resp_v.json()["version"] == version

    # Test 404 for non-existent document
    resp_404 = client.get("/api/v1/documents/999999")
    assert resp_404.status_code == 404


