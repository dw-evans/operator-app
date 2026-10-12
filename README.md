```

```

```
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash

nvm install 24.21.0
nvm use 24.21.0

npm install


```

```
./generate_certs.sh pixel-6a.tailcd5319.ts.net
```

```
cp .env.example .env
```

```
./build.sh && uv run main.py
```

# Offline-First Assembly Instruction & Feedback PWA

An air-gapped, offline-first Progressive Web Application (PWA) and backend service tailored for shop-floor assembly stations (optimized for Android tablets running Mozilla Firefox connected via a local isolated Wi-Fi router).

---

## Key Features

1. **10 Fixed Document Slots**:
   - The operator view presents a clean, touch-friendly grid of 10 document slots.
   - Tapping an active slot displays the live PDF instruction manual rendered natively inside the browser.
2. **Offline Resilience & PWA**:
   - Built with Workbox Service Worker and Cache Storage API.
   - Manuals and app assets are cached for 100% offline access.
   - IndexedDB stores queued feedback submissions and offline documents.
3. **Structured Operator Feedback Engine**:
   - Operators can record notes tied to exact manual page references.
   - Attach photos directly from tablet camera (`capture="environment"`).
   - Attach short video clips with client-side warnings if size > 100 MB or duration > 120 seconds.
   - If offline, submissions are saved to IndexedDB and automatically synchronized when Wi-Fi re-establishes connectivity.
4. **On-Demand Video Streaming & Caching**:
   - Feedback comments show video placeholders. Videos are only downloaded when the operator taps to stream/play, with an optional button to save the video to local storage for offline replay.
5. **Admin Management Portal**:
   - Manage document slots 1–10.
   - Deploy new manual revisions: increments version (`v1` → `v2`), marks previous version obsolete with timestamp, and stores file with MD5 hash.
   - Full chronological revision history modal with download links for past PDFs.
   - Feedback audit panel to view and transition comment status (`open` → `reviewed` → `resolved`).
   - Optional administrative PIN lock (configured via `ADMIN_PIN`).

---

## Quick Start

### 1. Build and Run via uv

```bash
# Initialize virtual environment and install backend dependencies
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]" 2>/dev/null || uv pip install fastapi uvicorn sqlalchemy pydantic python-multipart pytest httpx

# Build frontend PWA
cd frontend && npm install && npm run build && cd ..

# Launch FastAPI server
uvicorn main:app --host 0.0.0.0 --port 8000
```

Or run the all-in-one build script:

```bash
./build.sh
source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Access the Application

- **Tablet Operator View**: Open `http://<SERVER_IP>:8000/` in Firefox Android on any station tablet.
- **Admin Portal**: Tap the "Admin" button in the top navbar or navigate to `http://<SERVER_IP>:8000/admin`.
- **API Documentation**: Interactive Swagger docs available at `http://<SERVER_IP>:8000/docs`.

### 3. Optional Admin PIN Protection

To protect the admin management interface with a PIN, set the `ADMIN_PIN` environment variable when running the server:

```bash
ADMIN_PIN=1234 uvicorn main:app --host 0.0.0.0 --port 8000
```

If `ADMIN_PIN` is not set, admin access is unrestricted on the local subnet.

---

## Running Automated Tests

Run the backend test suite:

```bash
source .venv/bin/activate
pytest tests/ -v
```
