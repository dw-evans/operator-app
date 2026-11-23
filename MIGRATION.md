# Migrating from Legacy Assembly-Only App to Multi-App Platform

Because runtime data paths stayed consistent across the refactor (`assembly.db`, `storage/manuals/`, `storage/media/`, `.env`, `certs/`), migrating an existing shop-floor device to the new multi-app platform (Assembly Instructions + Inventory Manager + Leg Serial Scanner + Quality Issues) is straightforward.

---

## Path Reference (Legacy → New)

| Legacy Assembly-Only Device | Inside Backup `.zip` | New Multi-App Target |
| --- | --- | --- |
| `assembly.db` (+ `-wal` / `-shm`) | `<iso>/databases/assembly.db` | `assembly.db` *(WAL auto-recreated on start)* |
| `storage/manuals/*` | `<iso>/storage/manuals/*` | `storage/manuals/*` |
| `storage/media/*` | `<iso>/storage/media/*` | `storage/media/*` |
| *(not present)* | — | `inventory.db` *(auto-created on first start)* |
| `.env` *(optional)* | *(copy manually)* | `.env` |
| `certs/*` *(optional)* | *(copy manually)* | `certs/*` |

---

## Option A: Safe Backup → Clean Clone → Restore *(Recommended)*

1. **Back up the legacy device** (safe to run even while the old server is live—merges SQLite WAL cleanly):
   Copy `scripts/backup_legacy.py` onto the old device and run:
   ```bash
   python3 backup_legacy.py --source-dir /path/to/old/assembly-pwa
   ```
   This creates `backups/<YYYY-MM-DDTHH-MM-SSZ>.zip`.

2. **Optional integrity check** (unzips adjacent to the archive without overwriting and verifies SHA-256 + SQLite integrity):
   ```bash
   uv run scripts/unzip_backup.py backups/<YYYY-MM-DDTHH-MM-SSZ>.zip
   ```

3. **Stop the old server** (`Ctrl+C` or stop its service/tmux session).

4. **Clone the updated `main` branch** into a fresh folder:
   ```bash
   git clone <repo-url> assembly-pwa-new
   cd assembly-pwa-new
   ```

5. **Restore your data** (strictly refuses to overwrite any existing files):
   ```bash
   # Dry run first
   uv run scripts/restore_backup.py /path/to/backups/<YYYY-MM-DDTHH-MM-SSZ>.zip --dry-run

   # Restore assembly.db, storage/manuals/*, and storage/media/*
   uv run scripts/restore_backup.py /path/to/backups/<YYYY-MM-DDTHH-MM-SSZ>.zip
   ```

6. **Carry over local config and LAN HTTPS certs** (if used on that device):
   ```bash
   cp /path/to/old/assembly-pwa/.env .env
   cp -r /path/to/old/assembly-pwa/certs/* certs/
   ```

7. **Install dependencies, build the frontend, and start the server**:
   ```bash
   uv sync
   npm --prefix frontend install
   npm --prefix frontend run build
   uv run main.py
   ```
   On startup, the server automatically opens your restored `assembly.db`, applies any needed schema migrations, and initializes a fresh `inventory.db` (including `quality_issues`).

---

## Option B: In-Place Upgrade on the Same Folder *(Fastest)*

1. **Take a safety backup first** using `scripts/backup_legacy.py` and keep the `.zip` somewhere safe.
2. **Stop the running server** so `assembly.db` is closed cleanly.
3. **Pull `main`, update dependencies, rebuild, and restart**:
   ```bash
   git checkout main
   git pull origin main
   uv sync
   npm --prefix frontend install
   npm --prefix frontend run build
   uv run main.py
   ```
   Because `assembly.db`, `storage/manuals/*`, `storage/media/*`, `.env`, and `certs/*` are in `.gitignore`, `git pull` leaves all runtime data untouched.

---

## Post-Migration Note
- Hard-refresh (or reload once online) on any shop-floor tablets so their PWA service worker updates to the new multi-app bundle.
- For ongoing backups on the new platform, use `uv run scripts/backup.py` (backs up all `*.db` files and `storage/`).
