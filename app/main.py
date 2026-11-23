import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import config, schemas
from app.apps.instructions.database import init_instructions_db
from app.apps.instructions.router import router as instructions_router
from app.apps.inventory.database import init_inventory_db
from app.apps.inventory.router import router as inventory_router
from app.apps.quality.router import router as quality_router

# Initialize independent sub-app SQLite databases
init_instructions_db()
init_inventory_db()

app = FastAPI(
    title="Shop-Floor Multi-App Platform",
    description="Modular LAN PWA server for Assembly Instructions & Inventory Tracking",
    version="0.2.0",
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# Shared Shell Endpoints
# ==============================================================================


@app.api_route("/api/v1/health", methods=["GET", "HEAD"])
def health_check():
    """Lightweight connectivity ping endpoint."""
    return {"status": "ok"}


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


@app.get("/api/v1/cert/ca.crt")
@app.get("/ca.crt")
@app.get("/download-ca")
def download_ca_cert():
    """Direct download of the Root CA certificate for Android / client installation."""
    ca_path = config.CERTS_DIR / "ca.crt"
    if not ca_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="CA certificate not found. Run ./generate_certs.sh first.",
        )

    return FileResponse(
        ca_path,
        media_type="application/x-x509-ca-cert",
        headers={
            "Content-Disposition": 'attachment; filename="assembly-pwa-ca.crt"',
            "Cache-Control": "no-cache",
        },
    )


# ==============================================================================
# Mount Sub-Application Routers
# ==============================================================================

app.include_router(instructions_router)
app.include_router(inventory_router)
app.include_router(quality_router)

# Mount storage directories
app.mount("/manuals", StaticFiles(directory=str(config.MANUALS_DIR)), name="manuals")
app.mount("/media", StaticFiles(directory=str(config.MEDIA_DIR)), name="media")


# ==============================================================================
# PWA & SPA Fallback
# ==============================================================================


@app.get("/sw.js")
def serve_service_worker():
    """Explicit endpoint for service worker with Service-Worker-Allowed header."""
    sw_file = config.STATIC_PWA_DIR / "sw.js"
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
    manifest_file = config.STATIC_PWA_DIR / "manifest.json"
    if manifest_file.is_file():
        return FileResponse(
            manifest_file,
            media_type="application/manifest+json",
            headers={"Cache-Control": "no-cache"},
        )
    raise HTTPException(status_code=404, detail="Manifest not found")


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

    target = config.STATIC_PWA_DIR / clean_path
    if target.is_file():
        headers = {}
        if clean_path.startswith("assets/"):
            headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return FileResponse(target, headers=headers)

    if clean_path.startswith("assets/") or clean_path.endswith(
        (".js", ".mjs", ".css", ".wasm", ".map", ".png", ".jpg", ".svg", ".woff2")
    ):
        raise HTTPException(status_code=404, detail="Asset not found")

    index_file = config.STATIC_PWA_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(
            index_file,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    return {
        "name": "Shop-Floor Multi-App Backend Server",
        "status": "running",
        "api_docs": "/docs",
        "manifest": "/api/v1/manifest",
        "inventory": "/api/v1/inventory/parts",
        "message": "PWA frontend is compiling or not yet built into static_pwa/",
    }
