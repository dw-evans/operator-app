import pytest
from fastapi.testclient import TestClient

import cert_manager
import main

client = TestClient(main.app)


def test_cert_manager_ip_detection():
    ips = cert_manager.get_local_ip_addresses()
    assert isinstance(ips, list)
    assert len(ips) > 0
    assert "127.0.0.1" in ips

    hostnames = cert_manager.get_hostnames()
    assert isinstance(hostnames, list)
    assert "localhost" in hostnames


def test_cert_manager_ensure_certificates(tmp_path, monkeypatch):
    test_certs = tmp_path / "certs"
    monkeypatch.setattr(cert_manager, "CERTS_DIR", test_certs)

    res = cert_manager.ensure_certificates(force_regenerate=True)
    assert res["status"] == "ok"
    assert (test_certs / "ca.crt").is_file()
    assert (test_certs / "ca.key").is_file()
    assert (test_certs / "ca.der").is_file()
    assert (test_certs / "server.crt").is_file()
    assert (test_certs / "server.key").is_file()

    ca_content = (test_certs / "ca.crt").read_text()
    assert "-----BEGIN CERTIFICATE-----" in ca_content

    server_content = (test_certs / "server.crt").read_text()
    assert "-----BEGIN CERTIFICATE-----" in server_content


def test_api_get_cert_info():
    resp = client.get("/api/v1/cert/info")
    assert resp.status_code == 200
    data = resp.json()
    assert "ca_exists" in data
    assert "server_exists" in data
    assert "ips" in data
    assert "hostnames" in data
    assert "port" in data
    assert "use_https" in data
    assert data["ca_exists"] is True
    assert data["server_exists"] is True


def test_api_download_ca_crt():
    resp = client.get("/api/v1/cert/ca.crt")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/x-x509-ca-cert"
    assert 'filename="assembly-pwa-ca.crt"' in resp.headers.get("content-disposition", "")
    assert b"-----BEGIN CERTIFICATE-----" in resp.content


def test_api_download_ca_crt_aliases():
    for path in ["/ca.crt", "/download-ca"]:
        resp = client.get(path)
        assert resp.status_code == 200
        assert b"-----BEGIN CERTIFICATE-----" in resp.content


def test_api_download_ca_der():
    for path in ["/api/v1/cert/ca.der", "/ca.der"]:
        resp = client.get(path)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/x-x509-ca-cert"
        assert 'filename="assembly-pwa-ca.der"' in resp.headers.get("content-disposition", "")
        assert len(resp.content) > 100


def test_api_download_server_crt():
    resp = client.get("/api/v1/cert/server.crt")
    assert resp.status_code == 200
    assert b"-----BEGIN CERTIFICATE-----" in resp.content


def test_api_regenerate_certs():
    resp = client.post("/api/v1/cert/generate")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "method" in data
    assert "ips" in data
