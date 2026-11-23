#!/usr/bin/env python3
"""
Safely restore a backup zip created by scripts/backup.py.

SAFETY GUARANTEE:
  This script STRICTLY REFUSES to overwrite any existing data.
  Before writing a single byte, it verifies archive integrity (including SHA-256
  checksums when manifest.json is present) and checks every destination path
  (including SQLite -wal, -shm, and -journal sidecar files). If ANY target file
  already exists, the restore aborts with exit code 1 and leaves disk untouched.

Usage:
    uv run scripts/restore_backup.py backups/2026-11-23T22-28-25Z.zip
    python3 scripts/restore_backup.py backups/2026-11-23T22-28-25Z.zip --dry-run
    python3 scripts/restore_backup.py backups/2026-11-23T22-28-25Z.zip --target /path/to/restore_dir
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import zipfile
from pathlib import Path, PurePosixPath

REPO_ROOT = Path(__file__).resolve().parent.parent


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _safe_rel_parts(arcname: str) -> list[str]:
    """Validate an archive entry path against zip-slip / absolute path attacks."""
    p = PurePosixPath(arcname)
    if p.is_absolute() or ".." in p.parts:
        raise ValueError(f"Unsafe path in archive: {arcname!r}")
    return [part for part in p.parts if part not in ("", ".")]


def _strip_top_folder(parts: list[str]) -> list[str]:
    """
    Archive entries are stored under <iso_timestamp>/databases/... or <iso_timestamp>/storage/...
    Also supports flat archives starting directly with databases/ or storage/ for backward compatibility.
    """
    if not parts:
        return []
    if parts[0] in ("databases", "storage", "manifest.json"):
        return parts
    return parts[1:]


def restore_backup(zip_path: Path, target_dir: Path, dry_run: bool = False) -> int:
    if not zip_path.is_file():
        print(f"ERROR: Backup archive not found: {zip_path}", file=sys.stderr)
        return 1

    target_dir = target_dir.resolve()

    with zipfile.ZipFile(zip_path, "r") as zf:
        # 1. Basic zip CRC integrity check
        bad_member = zf.testzip()
        if bad_member is not None:
            print(f"ERROR: Corrupt file inside zip archive: {bad_member}", file=sys.stderr)
            return 1

        # 2. Locate optional manifest.json and build restore plan
        manifest_checksums: dict[str, str] = {}
        restore_plan: list[tuple[str, str, Path]] = []  # (arcname, logical_path, dst_path)

        for info in zf.infolist():
            if info.is_dir():
                continue
            parts = _safe_rel_parts(info.filename)
            inner = _strip_top_folder(parts)
            if not inner:
                continue

            logical = "/".join(inner)
            if logical == "manifest.json":
                manifest = json.loads(zf.read(info.filename).decode("utf-8"))
                for entry in manifest.get("files", []):
                    if isinstance(entry, dict) and "path" in entry and "sha256" in entry:
                        manifest_checksums[entry["path"]] = entry["sha256"]
                continue

            if inner[0] == "databases" and len(inner) == 2 and inner[1].endswith(".db"):
                dst = target_dir / inner[1]
                restore_plan.append((info.filename, logical, dst))
            elif inner[0] == "storage" and len(inner) >= 2:
                dst = target_dir / Path(*inner)
                restore_plan.append((info.filename, logical, dst))
            else:
                print(
                    f"WARNING: Skipping unrecognized archive entry: {info.filename}",
                    file=sys.stderr,
                )

        if not restore_plan:
            print("ERROR: No databases or storage files found in backup archive.", file=sys.stderr)
            return 1

        # 3. Verify destination paths are inside target_dir and check for ANY existing files
        conflicts: list[Path] = []
        for _arcname, logical, dst in restore_plan:
            resolved_dst = dst.resolve()
            try:
                resolved_dst.relative_to(target_dir)
            except ValueError:
                print(f"ERROR: Destination escapes target directory: {dst}", file=sys.stderr)
                return 1

            if dst.exists():
                conflicts.append(dst)

            # For SQLite databases, also refuse if WAL/SHM/journal sidecars exist
            if logical.startswith("databases/"):
                for suffix in ("-wal", "-shm", "-journal"):
                    sidecar = dst.parent / f"{dst.name}{suffix}"
                    if sidecar.exists():
                        conflicts.append(sidecar)

        if conflicts:
            print(
                "REFUSING TO RESTORE: The following destination file(s) already exist.\n"
                "This script never overwrites existing data. Move or remove them first, "
                "or specify an empty --target directory:",
                file=sys.stderr,
            )
            for path in sorted(set(conflicts)):
                print(f"  - {path}", file=sys.stderr)
            return 1

        # 4. Verify SHA-256 checksums before writing anything
        payloads: list[tuple[Path, bytes]] = []
        for arcname, logical, dst in restore_plan:
            data = zf.read(arcname)
            expected_hash = manifest_checksums.get(logical)
            if expected_hash is not None:
                actual_hash = sha256_bytes(data)
                if actual_hash != expected_hash:
                    print(
                        f"ERROR: Checksum mismatch for {logical} "
                        f"(expected {expected_hash[:12]}..., got {actual_hash[:12]}...).",
                        file=sys.stderr,
                    )
                    return 1
            payloads.append((dst, data))

    if dry_run:
        print(f"Dry run OK ({len(payloads)} files verified, 0 conflicts). Would restore to {target_dir}:")
        for dst, _data in payloads:
            print(f"  + {dst.relative_to(target_dir)}")
        return 0

    # 5. Write files using exclusive creation (O_CREAT | O_EXCL) so the OS also prevents overwrite
    target_dir.mkdir(parents=True, exist_ok=True)
    for dst, data in payloads:
        dst.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(dst), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
        except Exception:
            dst.unlink(missing_ok=True)
            raise

    print(f"Restore complete: {len(payloads)} file(s) restored cleanly to {target_dir}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Safely restore a backup zip without ever overwriting existing files."
    )
    parser.add_argument(
        "backup_zip",
        type=Path,
        help="Path to the backup .zip file created by scripts/backup.py",
    )
    parser.add_argument(
        "--target",
        type=Path,
        default=REPO_ROOT,
        help="Target directory to restore into (default: project root)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Verify archive integrity and check for conflicts without writing any files",
    )
    args = parser.parse_args()
    return restore_backup(args.backup_zip.resolve(), args.target, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
