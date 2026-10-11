"""Dual HTTP/HTTPS Server Runner for Assembly Instruction PWA.

Runs:
1. HTTP Server on port 8000 (configurable) for certificate onboarding and downloading.
2. HTTPS Server on port 8443 (configurable) with TLS certificate for offline PWA installation.

Usage:
    python3 run_server.py [--host 0.0.0.0] [--http-port 8000] [--https-port 8443]
"""

import argparse
import asyncio
import os
import signal
import sys
from pathlib import Path

import cert_manager

BASE_DIR = Path(__file__).resolve().parent


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run Assembly PWA HTTP (cert distribution) and HTTPS (PWA) server."
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("HOST", "0.0.0.0"),
        help="Host address to bind to (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--http-port",
        type=int,
        default=int(os.environ.get("PORT", "8000")),
        help="Port for HTTP server (default: 8000)",
    )
    parser.add_argument(
        "--https-port",
        type=int,
        default=int(os.environ.get("HTTPS_PORT", "8443")),
        help="Port for HTTPS server (default: 8443)",
    )
    parser.add_argument(
        "--no-http",
        action="store_true",
        help="Disable the HTTP server (only run HTTPS)",
    )
    parser.add_argument(
        "--no-https",
        action="store_true",
        help="Disable the HTTPS server (only run HTTP)",
    )
    parser.add_argument(
        "--regenerate-certs",
        action="store_true",
        help="Force regeneration of Root CA and server certificates before launch",
    )
    return parser.parse_args()


async def run_servers(args):
    import uvicorn

    os.environ["PORT"] = str(args.http_port)
    os.environ["HTTPS_PORT"] = str(args.https_port)

    # 1. Ensure certificates exist
    print("=" * 65)
    print("  ASSEMBLY PWA - AIR-GAPPED SHOP FLOOR SERVER")
    print("=" * 65)

    cert_res = cert_manager.ensure_certificates(force_regenerate=args.regenerate_certs)
    ca_crt = cert_manager.CERTS_DIR / "ca.crt"
    server_crt = cert_manager.CERTS_DIR / "server.crt"
    server_key = cert_manager.CERTS_DIR / "server.key"

    detected_ips = cert_manager.get_local_ip_addresses()
    primary_lan_ip = next((ip for ip in detected_ips if not ip.startswith("127.")), "127.0.0.1")

    print(f"\n[+] TLS Certificates: Ready ({cert_res['method']})")
    print(f"    - Root CA Cert:   {ca_crt}")
    print(f"    - Server Cert:    {server_crt}")
    print(f"    - Server SANs:    {', '.join(detected_ips)}")

    print("\n[+] Shop-Floor Tablet Instructions:")
    if not args.no_http:
        print(f"    1. Open Onboarding Setup: http://{primary_lan_ip}:{args.http_port}/cert")
        print(f"       (Download assembly-pwa-ca.crt & install into Android CA Store)")
    if not args.no_https:
        print(f"    2. Launch Secure PWA:    https://{primary_lan_ip}:{args.https_port}/")
        print(f"       (Tap browser menu ⋮ -> 'Install app')")
    print("-" * 65)

    servers = []

    # HTTP Server
    if not args.no_http:
        http_config = uvicorn.Config(
            "main:app",
            host=args.host,
            port=args.http_port,
            log_level="info",
            access_log=False,
        )
        http_server = uvicorn.Server(http_config)
        servers.append(http_server.serve())
        print(f"[*] HTTP listening on  http://{args.host}:{args.http_port}")

    # HTTPS Server
    if not args.no_https:
        if not server_crt.is_file() or not server_key.is_file():
            print("[!] Error: Server certificate or key missing. Cannot start HTTPS.")
            sys.exit(1)

        https_config = uvicorn.Config(
            "main:app",
            host=args.host,
            port=args.https_port,
            ssl_keyfile=str(server_key),
            ssl_certfile=str(server_crt),
            log_level="info",
            access_log=False,
        )
        https_server = uvicorn.Server(https_config)
        servers.append(https_server.serve())
        print(f"[*] HTTPS listening on https://{args.host}:{args.https_port}")

    print("=" * 65)
    print("Press Ctrl+C to stop the server.\n")

    if servers:
        await asyncio.gather(*servers)


def main():
    args = parse_args()

    # Graceful exit on SIGINT
    try:
        asyncio.run(run_servers(args))
    except (KeyboardInterrupt, SystemExit):
        print("\n[!] Server stopped.")


if __name__ == "__main__":
    main()
