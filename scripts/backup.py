#!/usr/bin/env python3
"""
Create a timestamped, zipped backup of all SQLite databases and storage media/manuals.

Usage:
    uv run scripts/backup.py
    python3 scripts/backup.py [--output-dir /path/to/backups]

What gets backed up (backward- & forward-compatible):
  - All *.db SQLite databases in the project root (using SQLite's online backup API
    so WAL-mode databases are captured safely and consistently even while the server runs)
  - All files under storage/ (manuals/, media/, media/quality/, etc.), preserving folders
  - A manifest.json with ISO timestamp, git revision, file sizes, and SHA-256 checksums
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def get_git_commit() -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(REPO_ROOT),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or None
    except Exception:
        return None


def sqlite_online_backup(src_db: Path, dst_db: Path) -> None:
    """Safely snapshot a SQLite database (including WAL changes) into a standalone file."""
    dst_db.parent.mkdir(parents=True, exist_ok=True)
    # Open source in read-only URI mode if possible, falling back to normal connect
    src_conn = sqlite3.connect(f"file:{src_db}?mode=ro", uri=True, timeout=30.0)
    try:
        dst_conn = sqlite3.connect(str(dst_db))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()


def create_backup(output_dir: Path) -> Path:
    now = datetime.now(timezone.utc)
    iso_timestamp = now.strftime("%Y-%m-%dT%H-%M-%SZ")

    output_dir.mkdir(parents=True, exist_ok=True)
    staging_dir = output_dir / iso_timestamp
    zip_path = output_dir / f"{iso_timestamp}.zip"

    if staging_dir.exists() or zip_path.exists():
        raise FileExistsError(
            f"Backup target already exists for timestamp {iso_timestamp}. "
            "Wait 1 second and try again."
        )

    db_files = sorted(
        p for p in REPO_ROOT.glob("*.db") if p.is_file()
    )
    storage_dir = REPO_ROOT / "storage"

    manifest_files: list[dict[str, object]] = []
    db_count = 0
    storage_count = 0

    try:
        staging_dir.mkdir(parents=True, exist_ok=False)

        # 1. Online-backup all SQLite databases into <iso>/databases/<name>.db
        dbs_out_dir = staging_dir / "databases"
        dbs_out_dir.mkdir(parents=True, exist_ok=True)
        for src_db in db_files:
            dst_db = dbs_out_dir / src_db.name
            sqlite_online_backup(src_db, dst_db)
            rel_in_archive = f"databases/{src_db.name}"
            manifest_files.append(
                {
                    "path": rel_in_archive,
                    "kind": "database",
                    "size_bytes": dst_db.stat().st_size,
                    "sha256": sha256_file(dst_db),
                }
            )
            db_count += 1

        # 2. Copy all files under storage/ into <iso>/storage/... preserving folders
        if storage_dir.is_dir():
            for src_file in sorted(storage_dir.rglob("*")):
                if not src_file.is_file() or src_file.name == ".gitkeep":
                    continue
                rel_storage = src_file.relative_to(storage_dir)
                dst_file = staging_dir / "storage" / rel_storage
                dst_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_file, dst_file)
                rel_in_archive = f"storage/{rel_storage.as_posix()}"
                manifest_files.append(
                    {
                        "path": rel_in_archive,
                        "kind": "storage",
                        "size_bytes": dst_file.stat().st_size,
                        "sha256": sha256_file(dst_file),
                    }
                )
                storage_count += 1

        # 3. Write manifest.json
        manifest = {
            "format_version": 1,
            "created_at_utc": now.isoformat(),
            "folder_name": iso_timestamp,
            "git_commit": get_git_commit(),
            "database_count": db_count,
            "storage_file_count": storage_count,
            "files": manifest_files,
        }
        manifest_path = staging_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

        # 4. Zip the ISO datestamp folder into backups/<iso_timestamp>.zip
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for item in sorted(staging_dir.rglob("*")):
                if item.is_file():
                    arcname = item.relative_to(output_dir).as_posix()
                    zf.write(item, arcname=arcname)

        return zip_path
    except Exception:
        # Clean up partial zip on error
        if zip_path.exists():
            zip_path.unlink(missing_ok=True)
        raise
    finally:
        # Always remove uncompressed staging directory once zipped (or on failure)
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a zipped ISO-datestamped backup of all databases and storage media."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT / "backups",
        help="Directory where the zipped backup will be saved (default: ./backups)",
    )
    args = parser.parse_args()

    try:
        zip_path = create_backup(args.output_dir.resolve())
    except Exception as exc:
        print(f"ERROR: Backup failed: {exc}", file=sys.stderr)
        return 1

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"Backup created successfully: {zip_path} ({size_mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
