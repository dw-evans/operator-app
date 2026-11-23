#!/usr/bin/env python3
"""
================================================================================
LEGACY ASSEMBLY-APP BACKUP SCRIPT & MIGRATION PATH REFERENCE
================================================================================

Purpose:
  Run this standalone script on a device still running the ORIGINAL single-app
  "Assembly Instruction & Feedback System" (before the multi-app Inventory /
  Scanner / Quality refactor). It uses only the Python 3 standard library and
  outputs the EXACT same zipped backup format as `scripts/backup.py`, so the
  resulting archive can be verified with `scripts/unzip_backup.py` and restored
  directly into the new multi-app codebase with `scripts/restore_backup.py`.

--------------------------------------------------------------------------------
LEGACY vs. NEW MULTI-APP FOLDER STRUCTURE & RESTORE PATH MAPPING
--------------------------------------------------------------------------------

Good news: the data file paths stayed consistent across the refactor!
Only the Python application code moved into `app/` (`app/apps/instructions/`,
`app/apps/inventory/`, `app/apps/quality/`), while runtime data stays at the
project root and under `storage/`.

  Legacy Assembly-Only Device              Archive Path (inside .zip)               New Multi-App Restore Target
  ---------------------------------------  ---------------------------------------  ---------------------------------------
  <legacy_root>/assembly.db                <iso>/databases/assembly.db              <new_root>/assembly.db
    (+ assembly.db-wal / assembly.db-shm   (merged cleanly via SQLite online         (single consistent .db; new app
     if running in WAL mode)                backup API — no -wal/-shm needed!)       auto-recreates WAL on startup)

  <legacy_root>/storage/manuals/*          <iso>/storage/manuals/*                  <new_root>/storage/manuals/*
    (PDF work instruction manuals)

  <legacy_root>/storage/media/*            <iso>/storage/media/*                    <new_root>/storage/media/*
    (operator feedback photos/videos)

  (Not present in legacy app)              (Not in legacy archive)                  <new_root>/inventory.db
                                                                                     (auto-created empty on first start
                                                                                      of the new multi-app server)

  (Not present in legacy app)              (Not in legacy archive)                  <new_root>/storage/media/quality/*
                                                                                     (auto-created on first quality photo)

Optional non-database files to carry over manually if migrating devices:
  <legacy_root>/.env                  -->  <new_root>/.env                          (ADMIN_PIN, host/port settings)
  <legacy_root>/certs/*               -->  <new_root>/certs/*                       (LAN HTTPS CA & server certificates)

--------------------------------------------------------------------------------
STEP-BY-STEP MIGRATION WORKFLOW
--------------------------------------------------------------------------------
  1. On the legacy device, copy this file (`backup_legacy.py`) anywhere and run:
       python3 backup_legacy.py --source-dir /path/to/legacy/assembly-pwa
     (Or drop it into the legacy repo root / `scripts/` and just run:
       python3 backup_legacy.py)
     This creates: backups/<YYYY-MM-DDTHH-MM-SSZ>.zip

  2. Copy that `.zip` to the new multi-app checkout's `backups/` directory.

  3. Optional integrity check (unzips beside the archive without overwriting):
       uv run scripts/unzip_backup.py backups/<YYYY-MM-DDTHH-MM-SSZ>.zip

  4. Make sure the new app directory does NOT already have an `assembly.db`
     (or any conflicting files in `storage/manuals/` or `storage/media/`),
     then restore safely:
       uv run scripts/restore_backup.py backups/<YYYY-MM-DDTHH-MM-SSZ>.zip --dry-run
       uv run scripts/restore_backup.py backups/<YYYY-MM-DDTHH-MM-SSZ>.zip

  5. Start the new server (`uv run main.py`). It will automatically run any
     schema migrations on `assembly.db` and initialize a fresh `inventory.db`.
================================================================================
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


def _detect_default_source_dir() -> Path:
    here = Path(__file__).resolve().parent
    # If placed inside <repo>/scripts/, use parent; if dropped in <repo>/, use here
    if here.name == "scripts":
        return here.parent
    return here


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def get_git_commit(repo_dir: Path) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(repo_dir),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or None
    except Exception:
        return None


def sqlite_online_backup(src_db: Path, dst_db: Path) -> None:
    """Safely snapshot a SQLite database (including WAL changes) into a standalone file."""
    dst_db.parent.mkdir(parents=True, exist_ok=True)
    src_conn = sqlite3.connect(f"file:{src_db}?mode=ro", uri=True, timeout=30.0)
    try:
        dst_conn = sqlite3.connect(str(dst_db))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()


def create_legacy_backup(source_dir: Path, output_dir: Path) -> Path:
    source_dir = source_dir.resolve()
    output_dir = output_dir.resolve()

    if not source_dir.is_dir():
        raise FileNotFoundError(f"Legacy source directory not found: {source_dir}")

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

    # Discover legacy databases (primarily assembly.db, plus any other root *.db)
    db_files = sorted(p for p in source_dir.glob("*.db") if p.is_file())

    # Discover manuals & media folders:
    # Standard legacy layout: <source_dir>/storage/manuals and <source_dir>/storage/media
    # Fallback layout (if ever moved): <source_dir>/manuals and <source_dir>/media
    storage_sources: list[tuple[Path, str]] = []
    storage_root = source_dir / "storage"
    if storage_root.is_dir():
        storage_sources.append((storage_root, ""))
    else:
        for folder_name in ("manuals", "media"):
            candidate = source_dir / folder_name
            if candidate.is_dir():
                storage_sources.append((candidate, folder_name))

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

        # 2. Copy all manuals & media into <iso>/storage/... (exact new-app format)
        for src_base, subprefix in storage_sources:
            for src_file in sorted(src_base.rglob("*")):
                if not src_file.is_file() or src_file.name == ".gitkeep":
                    continue
                rel_part = src_file.relative_to(src_base)
                rel_storage = Path(subprefix) / rel_part if subprefix else rel_part
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

        # 3. Write manifest.json (compatible with scripts/restore_backup.py & unzip_backup.py)
        manifest = {
            "format_version": 1,
            "source_layout": "legacy_assembly",
            "created_at_utc": now.isoformat(),
            "folder_name": iso_timestamp,
            "git_commit": get_git_commit(source_dir),
            "database_count": db_count,
            "storage_file_count": storage_count,
            "files": manifest_files,
        }
        (staging_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )

        # 4. Zip into <output_dir>/<iso_timestamp>.zip
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for item in sorted(staging_dir.rglob("*")):
                if item.is_file():
                    arcname = item.relative_to(output_dir).as_posix()
                    zf.write(item, arcname=arcname)

        return zip_path
    except Exception:
        if zip_path.exists():
            zip_path.unlink(missing_ok=True)
        raise
    finally:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)


def main() -> int:
    default_source = _detect_default_source_dir()
    parser = argparse.ArgumentParser(
        description=(
            "Backup a legacy single-app Assembly installation into the new "
            "multi-app compatible zipped backup format."
        )
    )
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=default_source,
        help=f"Path to the legacy assembly-pwa root directory (default: {default_source})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directory where the zipped backup will be saved (default: <source-dir>/backups)",
    )
    args = parser.parse_args()

    source_dir = args.source_dir.resolve()
    output_dir = args.output_dir.resolve() if args.output_dir else source_dir / "backups"

    try:
        zip_path = create_legacy_backup(source_dir, output_dir)
    except Exception as exc:
        print(f"ERROR: Legacy backup failed: {exc}", file=sys.stderr)
        return 1

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"Legacy backup created successfully: {zip_path} ({size_mb:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
