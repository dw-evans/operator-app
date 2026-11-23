"""
Root runner for the Shop-Floor Multi-App Server (`uv run main.py`).

Starts Uvicorn with backend auto-reload (watching `app/`) and a lightweight
debounced frontend watcher (watching `frontend/src/` & `frontend/index.html`)
that rebuilds the PWA into `static_pwa/` automatically on change.

Set `DEV_RELOAD=false` in `.env` or environment to disable watchers in production.
"""

import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Dict

from app.config import BASE_DIR, CERTS_DIR, FRONTEND_DIR


def _snapshot_frontend(watch_paths: list[Path]) -> Dict[str, float]:
    """Collect mtimes for frontend source files (excluding node_modules/dist)."""
    snap: Dict[str, float] = {}
    for root in watch_paths:
        if root.is_file():
            try:
                snap[str(root)] = root.stat().st_mtime
            except OSError:
                pass
        elif root.is_dir():
            for path in root.rglob("*"):
                if path.is_file():
                    try:
                        snap[str(path)] = path.stat().st_mtime
                    except OSError:
                        pass
    return snap


def _start_frontend_watcher(debounce_seconds: float = 0.8) -> None:
    """Poll frontend/src on a lightweight daemon thread and rebuild on debounced changes."""
    watch_paths = [
        FRONTEND_DIR / "src",
        FRONTEND_DIR / "index.html",
    ]
    if not (FRONTEND_DIR / "package.json").is_file():
        return

    def _watch_loop():
        last_snapshot = _snapshot_frontend(watch_paths)
        pending_change_at: float | None = None
        print(
            f"[watcher] Watching frontend/src for changes (debounce={debounce_seconds}s)..."
        )

        while True:
            time.sleep(0.4)
            current = _snapshot_frontend(watch_paths)
            if current != last_snapshot:
                last_snapshot = current
                pending_change_at = time.monotonic()

            if (
                pending_change_at is not None
                and (time.monotonic() - pending_change_at) >= debounce_seconds
            ):
                pending_change_at = None
                print("[watcher] Frontend change detected -> rebuilding static_pwa/...")
                started = time.monotonic()
                res = subprocess.run(
                    ["npm", "--prefix", str(FRONTEND_DIR), "run", "build"],
                    cwd=str(BASE_DIR),
                )
                elapsed = time.monotonic() - started
                if res.returncode == 0:
                    print(f"[watcher] Frontend rebuilt in {elapsed:.2f}s")
                else:
                    print(f"[watcher] Frontend build failed (exit {res.returncode})")
                # Refresh snapshot so any generated files don't re-trigger
                last_snapshot = _snapshot_frontend(watch_paths)

    t = threading.Thread(target=_watch_loop, name="frontend-watcher", daemon=True)
    t.start()


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8001"))
    host = os.environ.get("HOST", "0.0.0.0")
    use_https = os.environ.get("USE_HTTPS", "true").lower() in ("true", "1", "yes")
    dev_reload = os.environ.get("DEV_RELOAD", "true").lower() in ("true", "1", "yes")
    reload_delay = float(os.environ.get("RELOAD_DELAY", "0.5"))

    uvicorn_kwargs: dict = {
        "host": host,
        "port": port,
    }

    if use_https:
        server_crt = CERTS_DIR / "server.crt"
        server_key = CERTS_DIR / "server.key"
        if not server_crt.is_file() or not server_key.is_file():
            print("[!] TLS certificates not found in certs/ directory.")
            print("    Please run ./generate_certs.sh first.")
            raise SystemExit(1)
        uvicorn_kwargs["ssl_certfile"] = str(server_crt)
        uvicorn_kwargs["ssl_keyfile"] = str(server_key)
        proto = "https"
    else:
        proto = "http"

    if dev_reload:
        _start_frontend_watcher(debounce_seconds=max(0.5, reload_delay))
        uvicorn_kwargs["reload"] = True
        uvicorn_kwargs["reload_dirs"] = [str(BASE_DIR / "app")]
        uvicorn_kwargs["reload_delay"] = reload_delay
        print(
            f"Starting {proto.upper()} server on {proto}://{host}:{port} "
            f"(auto-reload ON, delay={reload_delay}s)"
        )
    else:
        print(f"Starting {proto.upper()} server on {proto}://{host}:{port}")

    uvicorn.run("app.main:app", **uvicorn_kwargs)
