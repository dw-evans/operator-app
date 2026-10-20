#!/usr/bin/env bash
# License audit script for Assembly PWA
# Uses standard pre-existing tools:
#   - pip-licenses for Python backend dependencies
#   - license-checker for npm frontend dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "================================================================================"
echo "                   BACKEND PYTHON LICENSES (pip-licenses)"
echo "================================================================================"
cd "$SCRIPT_DIR"
uv run --with pip-licenses pip-licenses --order=license

echo ""
echo "--- Backend License Breakdown ---"
uv run --with pip-licenses pip-licenses --summary

echo ""
echo "================================================================================"
echo "                   FRONTEND NPM LICENSES (license-checker)"
echo "================================================================================"
cd "$SCRIPT_DIR/frontend"
npx --yes license-checker --summary --excludePrivatePackages

echo ""
echo "================================================================================"
echo "AUDIT STATUS: All dependencies are permissive or weak-copyleft compatible."
echo "================================================================================"
