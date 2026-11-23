#!/usr/bin/env python3
"""
Safely unzip a backup archive into an adjacent folder with the same stem (no overwrite)
and verify archive, SHA-256 manifest, and SQLite database integrity.

Example:
    uv run scripts/unzip_backup.py backups/2026-11-23T22-29-38Z.zip
    -> extracts to backups/2026-11-23T22-29-38Z/ (refuses if folder already exists)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import zipfile
from pathlib import Path, PurePosixPath


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _safe_rel_parts(arcname: str) -> list[str]:
    p = PurePosixPath(arcname)
    if p.is_absolute() or ".." in p.parts:
        raise ValueError(f"Unsafe path in archive: {arcname!r}")
    return [part for part in p.parts if part not in ("", ".")]


def unzip_backup(zip_path: Path) -> int:
    zip_path = zip_path.resolve()
    if not zip_path.is_file():
        print(f"ERROR: Zip file not found: {zip_path}", file=sys.stderr)
        return 1

    dst_dir = zip_path.parent / zip_path.stem
    if dst_dir.exists():
        print(
            f"REFUSING TO UNZIP: Destination already exists: {dst_dir}\n"
            "This helper never overwrites existing folders or files.",
            file=sys.stderr,
        )
        return 1

    with zipfile.ZipFile(zip_path, "r") as zf:
        bad_member = zf.testzip()
        if bad_member is not None:
            print(f"ERROR: Corrupt file inside zip archive: {bad_member}", file=sys.stderr)
            return 1

        members = [info for info in zf.infolist() if not info.is_dir()]
        if not members:
            print("ERROR: Zip archive is empty.", file=sys.stderr)
            return 1

        parsed_parts = [_safe_rel_parts(info.filename) for info in members]

        # If every file lives under a single top-level folder matching the zip stem,
        # strip that wrapper so we don't create <stem>/<stem>/...
        top_levels = {parts[0] for parts in parsed_parts if parts}
        strip_prefix = len(top_levels) == 1 and next(iter(top_levels)) == zip_path.stem

        manifest_checksums: dict[str, str] = {}
        payloads: list[tuple[Path, str, bytes]] = []  # (dst_file, logical_rel, data)

        for info, parts in zip(members, parsed_parts):
            rel_parts = parts[1:] if strip_prefix else parts
            if not rel_parts:
                continue
            logical_rel = "/".join(rel_parts)
            data = zf.read(info.filename)

            if logical_rel == "manifest.json":
                manifest = json.loads(data.decode("utf-8"))
                for entry in manifest.get("files", []):
                    if isinstance(entry, dict) and "path" in entry and "sha256" in entry:
                        manifest_checksums[entry["path"]] = entry["sha256"]

            dst_file = (dst_dir / Path(*rel_parts)).resolve()
            try:
                dst_file.relative_to(dst_dir.resolve())
            except ValueError:
                print(f"ERROR: Entry escapes destination folder: {info.filename}", file=sys.stderr)
                return 1

            payloads.append((dst_file, logical_rel, data))

        # Verify SHA-256 checksums against manifest.json before writing anything
        verified_hashes = 0
        for _dst_file, logical_rel, data in payloads:
            expected = manifest_checksums.get(logical_rel)
            if expected is not None:
                actual = sha256_bytes(data)
                if actual != expected:
                    print(
                        f"ERROR: SHA-256 mismatch for {logical_rel} "
                        f"(expected {expected[:12]}..., got {actual[:12]}...).",
                        file=sys.stderr,
                    )
                    return 1
                verified_hashes += 1

    # Write extracted files using O_CREAT | O_EXCL
    dst_dir.mkdir(parents=True, exist_ok=False)
    for dst_file, _logical_rel, data in payloads:
        dst_file.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(dst_file), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        with os.fdopen(fd, "wb") as f:
            f.write(data)

    # Run SQLite PRAGMA integrity_check on any extracted .db files
    db_files = sorted(dst_dir.rglob("*.db"))
    for db_file in db_files:
        con = sqlite3.connect(f"file:{db_file}?mode=ro", uri=True)
        try:
            result = con.execute("PRAGMA integrity_check").fetchone()[0]
        finally:
            con.close()
        if result != "ok":
            print(f"WARNING: SQLite integrity_check failed for {db_file.name}: {result}", file=sys.stderr)
            return 1

    print(
        f"Unzipped {len(payloads)} file(s) to {dst_dir}\n"
        f"  - Zip CRC: OK\n"
        f"  - Manifest SHA-256 verified: {verified_hashes} file(s)\n"
        f"  - SQLite integrity_check: OK ({len(db_files)} database(s))"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Safely unzip a backup archive to an adjacent folder with the same stem (no overwrite)."
    )
    parser.add_argument(
        "zip_path",
        type=Path,
        help="Path to the .zip archive to extract",
    )
    args = parser.parse_args()
    return unzip_backup(args.zip_path)


if __name__ == "__main__":
    raise SystemExit(main())
