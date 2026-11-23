import os
from pathlib import Path

# Anchor BASE_DIR to the repository root (parent of app/)
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment configuration from .env file if present
_env_file = BASE_DIR / ".env"
if _env_file.is_file():
    for _env_line in _env_file.read_text().splitlines():
        _env_line = _env_line.strip()
        if _env_line and not _env_line.startswith("#") and "=" in _env_line:
            _k, _v = _env_line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip("'\""))

MANUALS_DIR = BASE_DIR / "storage" / "manuals"
MEDIA_DIR = BASE_DIR / "storage" / "media"
STATIC_PWA_DIR = BASE_DIR / "static_pwa"
CERTS_DIR = BASE_DIR / "certs"
FRONTEND_DIR = BASE_DIR / "frontend"

MANUALS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
STATIC_PWA_DIR.mkdir(parents=True, exist_ok=True)
CERTS_DIR.mkdir(parents=True, exist_ok=True)
