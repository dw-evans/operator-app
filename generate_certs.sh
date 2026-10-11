#!/usr/bin/env bash
# Script to generate SSL certificate for local IP on Assembly PWA

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR/certs"

mkdir -p "$SSL_DIR"

IP="${1:-192.168.178.30}"

echo "Generating SSL certificate for $IP..."

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout "$SSL_DIR/server.key" \
  -out "$SSL_DIR/server.crt" \
  -subj "/CN=$IP/O=Local Dev/C=US" \
  -addext "subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost"

# Copy as ca.crt so the browser download button serves this certificate
cp -f "$SSL_DIR/server.crt" "$SSL_DIR/ca.crt"

echo "SSL certificates generated in $SSL_DIR:"
echo " - Key:  $SSL_DIR/server.key"
echo " - Cert: $SSL_DIR/server.crt"
echo " - CA:   $SSL_DIR/ca.crt (install this on Android)"
