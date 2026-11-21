"""Prontezza per la produzione: header di sicurezza, healthcheck, frontend servito senza path traversal, CORS."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import config
from app.web import API_CSP, SecurityHeaders, inline_script_hashes, page_csp, spa_handler


def test_api_security_headers(client, master):
    r = client.get("/api/characters", headers=master)
    assert r.status_code == 200
    h = r.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"
    assert h["content-security-policy"] == API_CSP
    assert h["cache-control"] == "no-store"
    # anche sugli errori
    r = client.get("/api/characters")
    assert r.status_code == 401 and r.headers["content-security-policy"] == API_CSP


def test_health_needs_no_login_and_leaks_nothing(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_cors_only_configured_origins(client):
    ok = client.options("/api/health", headers={"Origin": "http://localhost:5174", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5174"
    assert "access-control-allow-credentials" not in ok.headers
    bad = client.options("/api/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_inline_script_hash():
    html = '<script>a()</script><script type="module" src="/x.js"></script>'
    hs = inline_script_hashes(html)
    assert len(hs) == 1 and hs[0].startswith("'sha256-")
    csp = page_csp(html)
    assert hs[0] in csp and "frame-ancestors 'none'" in csp and "'unsafe-eval'" not in csp


def _spa(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><script>t()</script><div id=root></div>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("NON DEVE USCIRE", encoding="utf-8")
    app = FastAPI()
    app.add_middleware(SecurityHeaders, page_policy=page_csp((dist / "index.html").read_text(encoding="utf-8")))
    app.add_api_route("/{path:path}", spa_handler(dist), methods=["GET", "HEAD"])
    return TestClient(app)


def test_spa_serves_files_and_fallback(tmp_path):
    c = _spa(tmp_path)
    r = c.get("/assets/app.js")
    assert r.status_code == 200 and "immutable" in r.headers["cache-control"]
    for p in ("/", "/personaggi/3/plancia", "/diario"):
        r = c.get(p)
        assert r.status_code == 200 and "id=root" in r.text, p
        assert "script-src 'self' 'sha256-" in r.headers["content-security-policy"]
    assert c.get("/api/nope").status_code == 404


def test_spa_blocks_traversal(tmp_path):
    c = _spa(tmp_path)
    for p in ("/../secret.txt", "/assets/../../secret.txt", "/%2e%2e/secret.txt", "/assets/%2e%2e/%2e%2e/secret.txt",
              "/..%5csecret.txt"):
        r = c.get(p)
        assert "NON DEVE USCIRE" not in r.text, p


def test_cors_env_parsing(monkeypatch):
    import importlib
    monkeypatch.setenv("STATISFY_ENV", "production")
    monkeypatch.setenv("STATISFY_CORS_ORIGINS", "https://a.example, *, ,https://b.example")
    try:
        importlib.reload(config)
        assert config.PRODUCTION
        assert config.CORS_ORIGINS == ["https://a.example", "https://b.example"]  # "*" ignorato
        monkeypatch.delenv("STATISFY_CORS_ORIGINS")
        importlib.reload(config)
        assert config.CORS_ORIGINS == []
    finally:
        monkeypatch.delenv("STATISFY_ENV")
        monkeypatch.delenv("STATISFY_CORS_ORIGINS", raising=False)
        importlib.reload(config)
    assert not config.PRODUCTION
