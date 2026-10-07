#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$DIR/certs"
mkdir -p "$CERTS_DIR"

echo "Generating Root CA..."
openssl req -x509 -new -nodes -keyout "$CERTS_DIR/ca.key" -out "$CERTS_DIR/ca.crt" -days 3650 -subj "/CN=Assembly PWA Root CA/O=Assembly Local Network/C=US"

HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

cat > "$CERTS_DIR/server.ext" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = assembly.local
IP.1 = 127.0.0.1
IP.2 = $HOST_IP
IP.3 = 192.168.178.30
IP.4 = 172.24.16.1
IP.5 = 10.5.0.2
IP.6 = 100.64.221.65
EOF

echo "Generating Server Key & CSR..."
openssl req -new -nodes -newkey rsa:2048 -keyout "$CERTS_DIR/server.key" -out "$CERTS_DIR/server.csr" -subj "/CN=192.168.178.30/O=Assembly Local/C=US"

echo "Signing Server Certificate with Root CA..."
openssl x509 -req -in "$CERTS_DIR/server.csr" -CA "$CERTS_DIR/ca.crt" -CAkey "$CERTS_DIR/ca.key" -CAcreateserial -out "$CERTS_DIR/server.crt" -days 1825 -extfile "$CERTS_DIR/server.ext"

cat "$CERTS_DIR/server.crt" "$CERTS_DIR/ca.crt" > "$CERTS_DIR/cert.pem"
cp "$CERTS_DIR/server.key" "$CERTS_DIR/key.pem"

echo "Certificates created in $CERTS_DIR:"
echo "  Server bundle: $CERTS_DIR/cert.pem"
echo "  Server key:    $CERTS_DIR/key.pem"
echo "  Tablet CA:     $CERTS_DIR/ca.crt"
