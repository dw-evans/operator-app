#!/usr/bin/env bash
set -e

echo "=== Building Frontend (PWA) ==="
cd frontend
npm install
npm run build
cd ..

echo "=== Syncing Python Virtual Environment ==="
[ -d ".venv" ] || uv venv
source .venv/bin/activate
uv pip install -e ".[dev]" 2>/dev/null || uv pip install fastapi uvicorn sqlalchemy pydantic python-multipart pytest httpx

echo "=== Running Backend Tests ==="
.venv/bin/pytest tests/ -v

echo "=== Build and Verification Complete! ==="
echo "To start server, run:"
echo "  source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000"
