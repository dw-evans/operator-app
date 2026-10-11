import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def test_download_ca_crt():
    resp = client.get("/api/v1/cert/ca.crt")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/x-x509-ca-cert"
    assert 'filename="assembly-pwa-ca.crt"' in resp.headers.get("content-disposition", "")
    assert b"-----BEGIN CERTIFICATE-----" in resp.content


def test_download_ca_crt_aliases():
    for path in ["/ca.crt", "/download-ca"]:
        resp = client.get(path)
        assert resp.status_code == 200
        assert b"-----BEGIN CERTIFICATE-----" in resp.content


def test_download_ca_crt_missing(tmp_path, monkeypatch):
    empty_certs_dir = tmp_path / "empty_certs"
    empty_certs_dir.mkdir()
    monkeypatch.setattr(main, "CERTS_DIR", empty_certs_dir)

    resp = client.get("/api/v1/cert/ca.crt")
    assert resp.status_code == 404
    assert "generate_certs.sh" in resp.json()["detail"]
