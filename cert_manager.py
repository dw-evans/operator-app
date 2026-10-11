"""Certificate generation and management module for Assembly PWA.

Generates:
1. A Root Certificate Authority (CA) certificate and private key.
2. A Server TLS certificate signed by the Root CA with Subject Alternative Names (SANs)
   covering localhost, 127.0.0.1, and all detected LAN / Wi-Fi / Tailscale IP addresses.

Supports pure Python via the `cryptography` package, with an automatic fallback
to the standard Linux `openssl` CLI if `cryptography` is not installed.
"""

import datetime
import ipaddress
import os
import re
import socket
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

BASE_DIR = Path(__file__).resolve().parent
CERTS_DIR = BASE_DIR / "certs"


def get_local_ip_addresses() -> List[str]:
    """Detect all IPv4 addresses associated with this host (LAN, Wi-Fi, Tailscale, loopback)."""
    ips: Set[str] = {"127.0.0.1"}

    # Method 1: Connect a UDP socket to determine the primary routing IP
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(0.5)
            # Doesn't actually send packets to 8.8.8.8, just queries local routing table
            s.connect(("8.8.8.8", 80))
            primary_ip = s.getsockname()[0]
            if primary_ip and primary_ip != "0.0.0.0":
                ips.add(primary_ip)
    except Exception:
        pass

    # Method 2: Inspect all hostnames from gethostbyname_ex
    try:
        hostname = socket.gethostname()
        _, _, host_ips = socket.gethostbyname_ex(hostname)
        for ip in host_ips:
            if not ip.startswith("127."):
                ips.add(ip)
    except Exception:
        pass

    # Method 3: Parse ip/ifconfig or /proc/net/fib_trie on Linux if available
    try:
        output = subprocess.check_output(["ip", "-4", "addr", "show"], text=True, timeout=2)
        found = re.findall(r"inet\s+(\d+\.\d+\.\d+\.\d+)/\d+", output)
        for ip in found:
            ips.add(ip)
    except Exception:
        pass

    # Check for custom environment variable overrides
    env_ips = os.environ.get("SERVER_IPS")
    if env_ips:
        for item in env_ips.split(","):
            clean = item.strip()
            if clean:
                ips.add(clean)

    # Sort so 127.0.0.1 is first, followed by private and tailscale IPs
    return sorted(list(ips))


def get_hostnames() -> List[str]:
    """Return DNS hostnames for Subject Alternative Names."""
    names: Set[str] = {"localhost"}
    try:
        h = socket.gethostname()
        if h:
            names.add(h)
            names.add(f"{h}.local")
    except Exception:
        pass

    env_hosts = os.environ.get("SERVER_HOSTS")
    if env_hosts:
        for item in env_hosts.split(","):
            clean = item.strip()
            if clean:
                names.add(clean)

    return sorted(list(names))


def _generate_with_cryptography(
    certs_dir: Path, ips: List[str], hostnames: List[str]
) -> Tuple[Path, Path, Path, Path]:
    """Generate CA and server certificates using python-cryptography."""
    from cryptography import x509
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    ca_key_path = certs_dir / "ca.key"
    ca_crt_path = certs_dir / "ca.crt"
    server_key_path = certs_dir / "server.key"
    server_crt_path = certs_dir / "server.crt"

    now = datetime.datetime.now(datetime.timezone.utc)

    # 1. Generate or load Root CA private key
    if ca_key_path.is_file() and ca_crt_path.is_file():
        with open(ca_key_path, "rb") as f:
            ca_key = serialization.load_pem_private_key(f.read(), password=None)
        with open(ca_crt_path, "rb") as f:
            ca_cert = x509.load_pem_x509_certificate(f.read())
    else:
        ca_key = rsa.generate_private_key(
            public_exponent=65537, key_size=2048, backend=default_backend()
        )
        ca_name = x509.Name(
            [
                x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
                x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Assembly Station Network"),
                x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "ShopFloor CA"),
                x509.NameAttribute(NameOID.COMMON_NAME, "Assembly PWA Root CA"),
            ]
        )
        ca_cert = (
            x509.CertificateBuilder()
            .subject_name(ca_name)
            .issuer_name(ca_name)
            .public_key(ca_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=3650))  # 10 years
            .add_extension(
                x509.BasicConstraints(ca=True, path_length=None),
                critical=True,
            )
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    key_encipherment=False,
                    key_cert_sign=True,
                    crl_sign=True,
                    content_commitment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .add_extension(
                x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),
                critical=False,
            )
            .sign(ca_key, hashes.SHA256(), default_backend())
        )

        with open(ca_key_path, "wb") as f:
            f.write(
                ca_key.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.TraditionalOpenSSL,
                    encryption_algorithm=serialization.NoEncryption(),
                )
            )
        with open(ca_crt_path, "wb") as f:
            f.write(ca_cert.public_bytes(serialization.Encoding.PEM))

    # Also save DER format of CA for older Android certificate installers
    ca_der_path = certs_dir / "ca.der"
    with open(ca_der_path, "wb") as f:
        f.write(ca_cert.public_bytes(serialization.Encoding.DER))

    # 2. Generate Server Certificate
    server_key = rsa.generate_private_key(
        public_exponent=65537, key_size=2048, backend=default_backend()
    )
    server_name = x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Assembly Station Network"),
            x509.NameAttribute(NameOID.COMMON_NAME, "Assembly PWA Server"),
        ]
    )

    # Build SAN entries
    san_entries: List[x509.GeneralName] = []
    for h in hostnames:
        san_entries.append(x509.DNSName(h))
    for ip_str in ips:
        try:
            san_entries.append(x509.IPAddress(ipaddress.ip_address(ip_str)))
        except ValueError:
            pass

    server_cert = (
        x509.CertificateBuilder()
        .subject_name(server_name)
        .issuer_name(ca_cert.subject)
        .public_key(server_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=825))  # 825 days browser compliant
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=True,
                key_cert_sign=False,
                crl_sign=False,
                content_commitment=False,
                data_encipherment=False,
                key_agreement=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .add_extension(
            x509.SubjectAlternativeName(san_entries),
            critical=False,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(server_key.public_key()),
            critical=False,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256(), default_backend())
    )

    with open(server_key_path, "wb") as f:
        f.write(
            server_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
    with open(server_crt_path, "wb") as f:
        f.write(server_cert.public_bytes(serialization.Encoding.PEM))

    return ca_crt_path, ca_key_path, server_crt_path, server_key_path


def _generate_with_openssl(
    certs_dir: Path, ips: List[str], hostnames: List[str]
) -> Tuple[Path, Path, Path, Path]:
    """Fallback generator using standard openssl CLI command."""
    ca_key_path = certs_dir / "ca.key"
    ca_crt_path = certs_dir / "ca.crt"
    ca_der_path = certs_dir / "ca.der"
    server_key_path = certs_dir / "server.key"
    server_crt_path = certs_dir / "server.crt"
    server_csr_path = certs_dir / "server.csr"

    # 1. Root CA
    if not (ca_key_path.is_file() and ca_crt_path.is_file()):
        ca_cnf_path = certs_dir / "ca_openssl.cnf"
        ca_cnf_content = """[ req ]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no

[ req_distinguished_name ]
C = US
O = Assembly Station Network
OU = ShopFloor CA
CN = Assembly PWA Root CA

[ v3_ca ]
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, cRLSign, keyCertSign
subjectKeyIdentifier = hash
"""
        with open(ca_cnf_path, "w") as f:
            f.write(ca_cnf_content)

        subprocess.run(
            ["openssl", "genrsa", "-out", str(ca_key_path), "2048"],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-new",
                "-nodes",
                "-key",
                str(ca_key_path),
                "-sha256",
                "-days",
                "3650",
                "-out",
                str(ca_crt_path),
                "-config",
                str(ca_cnf_path),
            ],
            check=True,
            capture_output=True,
        )

    # Convert CA to DER
    try:
        subprocess.run(
            ["openssl", "x509", "-in", str(ca_crt_path), "-outform", "der", "-out", str(ca_der_path)],
            check=True,
            capture_output=True,
        )
    except Exception:
        pass

    # 2. Server Certificate
    server_cnf_path = certs_dir / "server_openssl.cnf"
    san_lines: List[str] = []
    dns_idx = 1
    ip_idx = 1
    for h in hostnames:
        san_lines.append(f"DNS.{dns_idx} = {h}")
        dns_idx += 1
    for ip in ips:
        san_lines.append(f"IP.{ip_idx} = {ip}")
        ip_idx += 1

    san_block = "\n".join(san_lines)

    server_cnf_content = f"""[ req ]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[ req_distinguished_name ]
C = US
O = Assembly Station Network
CN = Assembly PWA Server

[ v3_req ]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[ alt_names ]
{san_block}
"""
    with open(server_cnf_path, "w") as f:
        f.write(server_cnf_content)

    subprocess.run(
        ["openssl", "genrsa", "-out", str(server_key_path), "2048"],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        [
            "openssl",
            "req",
            "-new",
            "-key",
            str(server_key_path),
            "-out",
            str(server_csr_path),
            "-config",
            str(server_cnf_path),
        ],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        [
            "openssl",
            "x509",
            "-req",
            "-in",
            str(server_csr_path),
            "-CA",
            str(ca_crt_path),
            "-CAkey",
            str(ca_key_path),
            "-CAcreateserial",
            "-out",
            str(server_crt_path),
            "-days",
            "825",
            "-sha256",
            "-extfile",
            str(server_cnf_path),
            "-extensions",
            "v3_req",
        ],
        check=True,
        capture_output=True,
    )

    return ca_crt_path, ca_key_path, server_crt_path, server_key_path


def ensure_certificates(force_regenerate: bool = False) -> Dict[str, any]:
    """Ensure that valid CA and server certificates exist in the certs/ directory.

    If missing or force_regenerate is True, generates them automatically.
    """
    CERTS_DIR.mkdir(parents=True, exist_ok=True)

    ca_crt_path = CERTS_DIR / "ca.crt"
    server_crt_path = CERTS_DIR / "server.crt"
    server_key_path = CERTS_DIR / "server.key"

    ips = get_local_ip_addresses()
    hostnames = get_hostnames()

    needs_generation = (
        force_regenerate
        or not ca_crt_path.is_file()
        or not server_crt_path.is_file()
        or not server_key_path.is_file()
    )

    if needs_generation:
        try:
            _generate_with_cryptography(CERTS_DIR, ips, hostnames)
            method = "cryptography"
        except ImportError:
            _generate_with_openssl(CERTS_DIR, ips, hostnames)
            method = "openssl"
    else:
        method = "cached"

    return {
        "status": "ok",
        "method": method,
        "ca_crt": str(ca_crt_path),
        "server_crt": str(server_crt_path),
        "server_key": str(server_key_path),
        "ips": ips,
        "hostnames": hostnames,
    }


def get_certificate_info() -> Dict[str, any]:
    """Return metadata about current certificates."""
    ca_crt_path = CERTS_DIR / "ca.crt"
    server_crt_path = CERTS_DIR / "server.crt"

    ca_exists = ca_crt_path.is_file()
    server_exists = server_crt_path.is_file()
    ips = get_local_ip_addresses()
    hostnames = get_hostnames()

    info = {
        "ca_exists": ca_exists,
        "server_exists": server_exists,
        "ips": ips,
        "hostnames": hostnames,
        "ca_filename": "assembly-pwa-ca.crt",
        "ca_download_url": "/api/v1/cert/ca.crt",
    }

    if ca_exists:
        try:
            stat = ca_crt_path.stat()
            info["ca_size"] = stat.st_size
            info["ca_modified"] = datetime.datetime.fromtimestamp(
                stat.st_mtime, tz=datetime.timezone.utc
            ).isoformat()
        except Exception:
            pass

    return info


if __name__ == "__main__":
    print("Generating certificates for Assembly PWA...")
    res = ensure_certificates(force_regenerate=True)
    print("Certificate Generation Result:")
    for k, v in res.items():
        print(f"  {k}: {v}")
