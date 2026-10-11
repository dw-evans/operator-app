import hashlib
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

import cert_manager
from database import Base, engine, get_db
import models
import schemas

# Create directories anchored to server base path
BASE_DIR = Path(__file__).resolve().parent
MANUALS_DIR = BASE_DIR / "storage" / "manuals"
MEDIA_DIR = BASE_DIR / "storage" / "media"
STATIC_PWA_DIR = BASE_DIR / "static_pwa"

MANUALS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
STATIC_PWA_DIR.mkdir(parents=True, exist_ok=True)

# Create database tables
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure TLS certificates exist on server startup."""
    try:
        cert_manager.ensure_certificates()
    except Exception as e:
        print(f"Warning: Could not auto-generate certificates on startup: {e}")
    yield


app = FastAPI(
    title="Assembly Instruction & Feedback System",
    description="Offline-first PWA server for air-gapped shop floor stations",
    version="0.1.0",
    lifespan=lifespan,
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.api_route("/api/v1/health", methods=["GET", "HEAD"])
def health_check():
    """Lightweight connectivity ping endpoint."""
    return {"status": "ok"}


@app.api_route(
    "/api/v1/manifest", methods=["GET", "HEAD"], response_model=schemas.ManifestResponse
)
def get_manifest(db: Session = Depends(get_db)):
    """Return all live documents for slots 1-10."""
    live_docs = (
        db.query(models.Document)
        .filter(models.Document.is_live == True)
        .order_by(models.Document.slot_id)
        .all()
    )
    return {
        "documents": [
            {
                "slot_id": doc.slot_id,
                "title": doc.title,
                "url": f"/manuals/{doc.filename}?v={doc.file_hash}",
                "version": doc.version,
                "file_hash": doc.file_hash,
                "file_size": doc.file_size,
                "upload_date": doc.upload_date,
            }
            for doc in live_docs
        ]
    }


@app.api_route(
    "/api/v1/slots", methods=["GET", "HEAD"], response_model=List[schemas.SlotSummary]
)
def get_slots_summary(db: Session = Depends(get_db)):
    """Return summary for all 10 slots (1-10) with live document and feedback counts."""
    summaries = []
    for slot_id in range(1, 11):
        live_doc = (
            db.query(models.Document)
            .filter(models.Document.slot_id == slot_id, models.Document.is_live == True)
            .first()
        )
        total_revs = (
            db.query(models.Document).filter(models.Document.slot_id == slot_id).count()
        )
        total_fb = (
            db.query(models.Feedback).filter(models.Feedback.slot_id == slot_id).count()
        )
        open_fb = (
            db.query(models.Feedback)
            .filter(
                models.Feedback.slot_id == slot_id, models.Feedback.status == "open"
            )
            .count()
        )

        doc_summary = None
        if live_doc:
            doc_summary = schemas.DocumentRevision(
                id=live_doc.id,
                slot_id=live_doc.slot_id,
                title=live_doc.title,
                filename=live_doc.filename,
                original_filename=live_doc.original_filename,
                file_hash=live_doc.file_hash,
                file_size=live_doc.file_size,
                version=live_doc.version,
                is_live=live_doc.is_live,
                upload_date=live_doc.upload_date,
                obsolescence_date=live_doc.obsolescence_date,
                url=f"/manuals/{live_doc.filename}?v={live_doc.file_hash}",
            )

        summaries.append(
            schemas.SlotSummary(
                slot_id=slot_id,
                live_document=doc_summary,
                total_revisions=total_revs,
                total_feedback=total_fb,
                open_feedback=open_fb,
            )
        )
    return summaries


@app.post("/api/v1/feedback")
async def create_feedback(
    id: str = Form(...),
    station_id: str = Form(...),
    slot_id: int = Form(...),
    page_ref: int = Form(...),
    author: str = Form(...),
    text_comment: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    photos: List[UploadFile] = File([]),
    db: Session = Depends(get_db),
):
    """Receive operator feedback with optional video and photo uploads."""
    if slot_id < 1 or slot_id > 10:
        raise HTTPException(status_code=400, detail="Slot ID must be between 1 and 10")

    # Check if feedback already exists (idempotency for offline sync retries)
    existing_fb = db.query(models.Feedback).filter(models.Feedback.id == id).first()
    if existing_fb:
        return {"status": "success", "id": id, "message": "Feedback already recorded"}

    # Find the current live document for this slot to link document_id
    live_doc = (
        db.query(models.Document)
        .filter(models.Document.slot_id == slot_id, models.Document.is_live == True)
        .first()
    )
    doc_id = live_doc.id if live_doc else None

    # Process video file
    video_filename = None
    if video and video.filename:
        v_ext = (
            video.filename.split(".")[-1].lower() if "." in video.filename else "mp4"
        )
        video_filename = f"{id}_video.{v_ext}"
        v_path = MEDIA_DIR / video_filename
        content = await video.read()
        with open(v_path, "wb") as f:
            f.write(content)

    # Process photo files
    photo_names = []
    for idx, photo in enumerate(photos):
        if photo and photo.filename:
            p_ext = (
                photo.filename.split(".")[-1].lower()
                if "." in photo.filename
                else "jpg"
            )
            p_name = f"{id}_photo_{idx}.{p_ext}"
            p_path = MEDIA_DIR / p_name
            content = await photo.read()
            with open(p_path, "wb") as f:
                f.write(content)
            photo_names.append(p_name)

    db_feedback = models.Feedback(
        id=id,
        station_id=station_id,
        slot_id=slot_id,
        document_id=doc_id,
        page_ref=page_ref,
        author=author,
        text_comment=text_comment,
        video_filename=video_filename,
        photo_filenames=json.dumps(photo_names),
        timestamp=datetime.now(timezone.utc),
        status="open",
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)

    return {"status": "success", "id": id}


@app.get("/api/v1/feedback/{slot_id}", response_model=List[schemas.FeedbackItem])
def get_slot_feedback(slot_id: int, db: Session = Depends(get_db)):
    """Retrieve all feedback submitted for a slot, ordered newest first."""
    items = (
        db.query(models.Feedback)
        .filter(models.Feedback.slot_id == slot_id)
        .order_by(models.Feedback.timestamp.desc())
        .all()
    )
    result = []
    for item in items:
        p_names = json.loads(item.photo_filenames) if item.photo_filenames else []
        result.append(
            schemas.FeedbackItem(
                id=item.id,
                station_id=item.station_id,
                slot_id=item.slot_id,
                document_id=item.document_id,
                page_ref=item.page_ref,
                author=item.author,
                text_comment=item.text_comment,
                video_filename=item.video_filename,
                video_url=f"/media/{item.video_filename}"
                if item.video_filename
                else None,
                photo_filenames=p_names,
                photo_urls=[f"/media/{p}" for p in p_names],
                timestamp=item.timestamp,
                status=item.status,
            )
        )
    return result


@app.patch("/api/v1/feedback/{feedback_id}/status")
def update_feedback_status(
    feedback_id: str,
    status_update: schemas.FeedbackStatusUpdate,
    db: Session = Depends(get_db),
):
    """Update feedback status (open, reviewed, resolved)."""
    item = db.query(models.Feedback).filter(models.Feedback.id == feedback_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Feedback item not found")

    item.status = status_update.status
    db.commit()
    db.refresh(item)
    return {"status": "success", "id": item.id, "new_status": item.status}


@app.post("/api/v1/admin/upload/{slot_id}")
async def admin_upload(
    slot_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload or replace a manual for a slot (1-10). Uses filename as document title and records upload date."""
    if slot_id < 1 or slot_id > 10:
        raise HTTPException(status_code=400, detail="Slot ID must be between 1 and 10")

    content = await file.read()
    file_size = len(content)
    file_hash = hashlib.md5(content).hexdigest()[:8]
    stored_filename = f"slot_{slot_id}_{file_hash}.pdf"
    file_path = MANUALS_DIR / stored_filename

    with open(file_path, "wb") as f:
        f.write(content)

    doc_title = file.filename or f"Manual Slot {slot_id}"

    # Mark existing live document for this slot as obsolete
    existing = (
        db.query(models.Document)
        .filter(models.Document.slot_id == slot_id, models.Document.is_live == True)
        .first()
    )
    if existing:
        existing.is_live = False
        existing.obsolescence_date = datetime.now(timezone.utc)

    # Increment version or start at 1
    new_version = (existing.version + 1) if existing else 1

    new_doc = models.Document(
        slot_id=slot_id,
        title=doc_title,
        filename=stored_filename,
        original_filename=file.filename or stored_filename,
        file_hash=file_hash,
        file_size=file_size,
        version=new_version,
        is_live=True,
        upload_date=datetime.now(timezone.utc),
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    return {
        "status": "success",
        "slot_id": slot_id,
        "version": new_version,
        "title": doc_title,
        "file_hash": file_hash,
        "filename": stored_filename,
    }


@app.get(
    "/api/v1/admin/history/{slot_id}", response_model=List[schemas.DocumentRevision]
)
def get_slot_history(slot_id: int, db: Session = Depends(get_db)):
    """Retrieve full revision history for a slot (live and obsolete), newest first."""
    if slot_id < 1 or slot_id > 10:
        raise HTTPException(status_code=400, detail="Slot ID must be between 1 and 10")

    revs = (
        db.query(models.Document)
        .filter(models.Document.slot_id == slot_id)
        .order_by(models.Document.version.desc())
        .all()
    )
    return [
        schemas.DocumentRevision(
            id=doc.id,
            slot_id=doc.slot_id,
            title=doc.title,
            filename=doc.filename,
            original_filename=doc.original_filename,
            file_hash=doc.file_hash,
            file_size=doc.file_size,
            version=doc.version,
            is_live=doc.is_live,
            upload_date=doc.upload_date,
            obsolescence_date=doc.obsolescence_date,
            url=f"/manuals/{doc.filename}?v={doc.file_hash}",
        )
        for doc in revs
    ]


@app.get("/api/v1/admin/pin-status", response_model=schemas.PinVerifyResponse)
def get_pin_status():
    """Check if an admin PIN is configured."""
    admin_pin = os.environ.get("ADMIN_PIN")
    pin_required = bool(admin_pin and admin_pin.strip())
    return {"valid": not pin_required, "pin_required": pin_required}


@app.post("/api/v1/admin/verify-pin", response_model=schemas.PinVerifyResponse)
def verify_admin_pin(req: schemas.PinVerifyRequest):
    """Verify an admin PIN."""
    admin_pin = os.environ.get("ADMIN_PIN")
    if not admin_pin or not admin_pin.strip():
        return {"valid": True, "pin_required": False}

    valid = req.pin == admin_pin.strip()
    return {"valid": valid, "pin_required": True}


# ==============================================================================
# Certificate Generation & Hosting Endpoints for Android PWA HTTPS
# ==============================================================================


@app.get("/api/v1/cert/info")
def get_cert_info():
    """Get metadata about Root CA and server certificates."""
    info = cert_manager.get_certificate_info()
    https_port = int(os.environ.get("HTTPS_PORT", "8443"))
    http_port = int(os.environ.get("PORT", "8000"))
    info["https_port"] = https_port
    info["http_port"] = http_port
    return info


@app.post("/api/v1/cert/generate")
def generate_cert():
    """Force (re)generation of CA and server certificates."""
    res = cert_manager.ensure_certificates(force_regenerate=True)
    return res


@app.get("/api/v1/cert/ca.crt")
@app.get("/ca.crt")
@app.get("/download-ca")
def download_ca_cert():
    """Direct download of the Root CA certificate for Android / client installation."""
    ca_path = cert_manager.CERTS_DIR / "ca.crt"
    if not ca_path.is_file():
        cert_manager.ensure_certificates()
    if not ca_path.is_file():
        raise HTTPException(status_code=404, detail="CA certificate not found")

    return FileResponse(
        ca_path,
        media_type="application/x-x509-ca-cert",
        headers={
            "Content-Disposition": 'attachment; filename="assembly-pwa-ca.crt"',
            "Cache-Control": "no-cache",
        },
    )


@app.get("/api/v1/cert/ca.der")
@app.get("/ca.der")
def download_ca_der_cert():
    """Direct download of the Root CA in DER binary format (preferred by some Android versions)."""
    ca_der_path = cert_manager.CERTS_DIR / "ca.der"
    if not ca_der_path.is_file():
        cert_manager.ensure_certificates()
    if not ca_der_path.is_file():
        raise HTTPException(status_code=404, detail="CA DER certificate not found")

    return FileResponse(
        ca_der_path,
        media_type="application/x-x509-ca-cert",
        headers={
            "Content-Disposition": 'attachment; filename="assembly-pwa-ca.der"',
            "Cache-Control": "no-cache",
        },
    )


@app.get("/api/v1/cert/server.crt")
def download_server_cert():
    """Download the active server certificate."""
    srv_path = cert_manager.CERTS_DIR / "server.crt"
    if not srv_path.is_file():
        raise HTTPException(status_code=404, detail="Server certificate not found")
    return FileResponse(
        srv_path,
        media_type="application/x-x509-ca-cert",
        headers={"Content-Disposition": 'attachment; filename="assembly-pwa-server.crt"'},
    )


@app.get("/cert", response_class=HTMLResponse)
@app.get("/setup", response_class=HTMLResponse)
def cert_setup_page():
    """Self-contained, air-gapped HTML onboarding page for Android certificate installation."""
    https_port = int(os.environ.get("HTTPS_PORT", "8443"))

    html_content = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTTPS & Android PWA Certificate Setup</title>
  <style>
    :root {{
      --bg: #09090b;
      --card: #18181b;
      --border: rgba(255,255,255,0.12);
      --text: #fafafa;
      --muted: #a1a1aa;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --success: #10b981;
      --amber: #f59e0b;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      padding: 1.5rem 1rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }}
    .container {{
      width: 100%;
      max-width: 680px;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.05);
      color: var(--text);
      margin-bottom: 0.75rem;
    }}
    .badge-success {{
      border-color: rgba(16, 185, 129, 0.3);
      color: var(--success);
      background: rgba(16, 185, 129, 0.1);
    }}
    h1 {{
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
    }}
    p.subtitle {{
      font-size: 0.875rem;
      color: var(--muted);
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }}
    .card {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
    }}
    .card-title {{
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }}
    .btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.75rem 1rem;
      font-size: 0.9375rem;
      font-weight: 600;
      border-radius: 0.5rem;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }}
    .btn-primary {{
      background: var(--primary);
      color: #ffffff;
    }}
    .btn-primary:hover {{
      background: var(--primary-hover);
    }}
    .btn-outline {{
      background: transparent;
      border-color: var(--border);
      color: var(--text);
      margin-top: 0.5rem;
    }}
    .btn-outline:hover {{
      background: rgba(255,255,255,0.05);
    }}
    .btn-success {{
      background: var(--success);
      color: #ffffff;
    }}
    .steps {{
      list-style: none;
      counter-reset: step-counter;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 1rem;
    }}
    .step-item {{
      display: flex;
      align-items: flex-start;
      gap: 0.875rem;
      font-size: 0.875rem;
      line-height: 1.4;
    }}
    .step-num {{
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 1.75rem;
      height: 1.75rem;
      border-radius: 9999px;
      background: rgba(255,255,255,0.1);
      border: 1px solid var(--border);
      font-weight: 700;
      font-size: 0.75rem;
      color: var(--text);
    }}
    .step-content strong {{
      color: #ffffff;
    }}
    .code-box {{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8125rem;
      background: rgba(0,0,0,0.4);
      padding: 0.2rem 0.4rem;
      border-radius: 0.25rem;
      border: 1px solid var(--border);
      color: #93c5fd;
    }}
    .server-url {{
      margin-top: 1rem;
      padding: 0.75rem;
      border-radius: 0.5rem;
      background: rgba(0,0,0,0.3);
      border: 1px dashed var(--border);
      font-size: 0.8125rem;
      word-break: break-all;
    }}
    .back-link {{
      display: inline-block;
      margin-top: 1.5rem;
      font-size: 0.875rem;
      color: var(--muted);
      text-decoration: none;
    }}
    .back-link:hover {{
      color: var(--text);
      text-decoration: underline;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="badge badge-success">✓ HTTPS CA Certificate Active</div>
    <h1>Android PWA Certificate Setup</h1>
    <p class="subtitle">
      Install the local Root Certificate Authority (CA) on your Android tablet so Chrome and Firefox fully trust the offline HTTPS connection and enable the <strong>"Install app"</strong> PWA prompt.
    </p>

    <!-- Download Card -->
    <div class="card">
      <div class="card-title">
        <span>1. Download Certificate</span>
        <span class="badge">Valid 10 Years</span>
      </div>
      <p style="font-size: 0.875rem; color: var(--muted); margin-bottom: 1rem;">
        Download the Root CA certificate file to this tablet's storage:
      </p>
      <a href="/api/v1/cert/ca.crt" download="assembly-pwa-ca.crt" class="btn btn-primary">
        📥 Download CA Certificate (.crt)
      </a>
      <a href="/api/v1/cert/ca.der" download="assembly-pwa-ca.der" class="btn btn-outline" style="font-size: 0.8125rem;">
        Download DER Format (.der for older Android)
      </a>
    </div>

    <!-- Android Install Steps Card -->
    <div class="card">
      <div class="card-title">2. Install on Android Tablet</div>
      <ul class="steps">
        <li class="step-item">
          <div class="step-num">1</div>
          <div class="step-content">
            Tap the blue button above to download <span class="code-box">assembly-pwa-ca.crt</span>.
          </div>
        </li>
        <li class="step-item">
          <div class="step-num">2</div>
          <div class="step-content">
            Open Android <strong>Settings</strong> ➔ <strong>Security</strong> (or <em>Security & Privacy</em> ➔ <em>More security settings</em> ➔ <em>Encryption & credentials</em>).
          </div>
        </li>
        <li class="step-item">
          <div class="step-num">3</div>
          <div class="step-content">
            Select <strong>Install a certificate</strong> ➔ <strong>CA certificate</strong>.<br>
            <em style="color: var(--amber); font-size: 0.8rem;">(If Android shows a warning about personal data, tap <strong>"Install anyway"</strong>)</em>
          </div>
        </li>
        <li class="step-item">
          <div class="step-num">4</div>
          <div class="step-content">
            Choose the downloaded <span class="code-box">assembly-pwa-ca.crt</span> file from your <em>Downloads</em> folder. Android will confirm "CA certificate installed".
          </div>
        </li>
        <li class="step-item">
          <div class="step-num">5</div>
          <div class="step-content">
            Return to your browser and open the secure HTTPS URL below.
          </div>
        </li>
        <li class="step-item">
          <div class="step-num">6</div>
          <div class="step-content">
            Tap the browser menu (⋮) and tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
          </div>
        </li>
      </ul>
    </div>

    <!-- Launch App Card -->
    <div class="card">
      <div class="card-title">3. Open Secure App (HTTPS)</div>
      <p style="font-size: 0.875rem; color: var(--muted); margin-bottom: 0.75rem;">
        Once installed, launch the PWA over HTTPS:
      </p>
      <a id="https-btn" href="#" class="btn btn-success">
        🚀 Launch Secure App (HTTPS)
      </a>
      <div class="server-url">
        <strong>Direct URL:</strong> <span id="https-url-text">Loading...</span>
      </div>
    </div>

    <a href="/" class="back-link">← Return to Assembly Manuals</a>
  </div>

  <script>
    // Automatically match the hostname the user accessed the server with
    const host = window.location.hostname || '127.0.0.1';
    const httpsPort = '{https_port}';
    const httpsUrl = `https://${{host}}:${{httpsPort}}/`;

    const btn = document.getElementById('https-btn');
    const txt = document.getElementById('https-url-text');
    if (btn) btn.href = httpsUrl;
    if (txt) txt.textContent = httpsUrl;
  </script>
</body>
</html>"""
    return HTMLResponse(content=html_content)


# Mount storage directories
app.mount("/manuals", StaticFiles(directory=str(MANUALS_DIR)), name="manuals")
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")


@app.get("/sw.js")
def serve_service_worker():
    """Explicit endpoint for service worker with Service-Worker-Allowed header."""
    sw_file = STATIC_PWA_DIR / "sw.js"
    if sw_file.is_file():
        return FileResponse(
            sw_file,
            media_type="application/javascript",
            headers={
                "Service-Worker-Allowed": "/",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )
    raise HTTPException(status_code=404, detail="Service worker not found")


@app.get("/manifest.json")
def serve_manifest():
    """Explicit endpoint for Web App Manifest with correct manifest MIME type."""
    manifest_file = STATIC_PWA_DIR / "manifest.json"
    if manifest_file.is_file():
        return FileResponse(
            manifest_file,
            media_type="application/manifest+json",
            headers={"Cache-Control": "no-cache"},
        )
    raise HTTPException(status_code=404, detail="Manifest not found")


# SPA Fallback for static PWA
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve static PWA files with index.html fallback for client-side routing."""
    clean_path = full_path.lstrip("/")
    if clean_path.startswith(("api/", "manuals/", "media/")) or clean_path in (
        "api",
        "manuals",
        "media",
        "sw.js",
        "manifest.json",
    ):
        raise HTTPException(status_code=404, detail="Resource not found")

    target = STATIC_PWA_DIR / clean_path
    if target.is_file():
        return FileResponse(target)

    index_file = STATIC_PWA_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)

    return {
        "name": "Assembly PWA Backend Server",
        "status": "running",
        "api_docs": "/docs",
        "manifest": "/api/v1/manifest",
        "message": "PWA frontend is compiling or not yet built into static_pwa/",
    }


if __name__ == "__main__":
    import uvicorn

    print("Starting server on http://127.0.0.1:8000")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
