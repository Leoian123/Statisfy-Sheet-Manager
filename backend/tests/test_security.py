"""Audit di sicurezza: autenticazione, autorizzazione (IDOR), iniezioni, CORS, rate limit del login."""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from sqlalchemy import delete, select

from app import auth, config
from app.db import SessionLocal
from app.models import Character, Roll, User
from conftest import login

ROOT = Path(__file__).resolve().parents[2]


def cid(client, h, name):
    return next(c["id"] for c in client.get("/api/characters", headers=h).json() if c["name"] == name)


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def user_id(username):
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.username == username))


def token_for(uid, *, key=None, alg="HS256", hours=1, **extra):
    now = datetime.now(timezone.utc)
    payload = {"sub": str(uid), "role": "player", "iat": now, "exp": now + timedelta(hours=hours), **extra}
    return jwt.encode(payload, key or config.SECRET, algorithm=alg)


# ---------------------------------------------------------------- autenticazione

def test_missing_or_wrong_scheme_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer "}).status_code == 401
    r = client.get("/api/characters", headers=bearer("non.un.jwt"))
    assert r.status_code == 401 and r.headers.get("www-authenticate") == "Bearer"


def test_expired_token(client):
    tok = token_for(user_id("giocatore1"), hours=-1)
    r = client.get("/api/auth/me", headers=bearer(tok))
    assert r.status_code == 401 and "scaduta" in r.json()["detail"]


def test_tampered_token_and_other_key(client):
    tok = login(client, "giocatore1")["Authorization"].split()[1]
    head, body, sig = tok.split(".")
    # firma alterata
    bad_sig = sig[:-2] + ("AA" if not sig.endswith("AA") else "BB")
    assert client.get("/api/auth/me", headers=bearer(f"{head}.{body}.{bad_sig}")).status_code == 401
    # payload alterato (sub del Master) con la firma originale
    forged_body = jwt.utils.base64url_encode(b'{"sub":"1","role":"master","exp":9999999999}').decode()
    assert client.get("/api/auth/me", headers=bearer(f"{head}.{forged_body}.{sig}")).status_code == 401
    # firmato con un'altra chiave
    other = token_for(user_id("master"), key="un-altra-chiave-lunga-almeno-32-byte!!")
    assert client.get("/api/auth/me", headers=bearer(other)).status_code == 401


def test_alg_none_rejected(client):
    tok = jwt.encode({"sub": str(user_id("master")), "exp": 9999999999}, key=None, algorithm="none")
    assert client.get("/api/auth/me", headers=bearer(tok)).status_code == 401
    # anche con il punto finale senza firma
    head = jwt.utils.base64url_encode(b'{"alg":"none","typ":"JWT"}').decode()
    body = jwt.utils.base64url_encode(b'{"sub":"1","exp":9999999999}').decode()
    assert client.get("/api/auth/me", headers=bearer(f"{head}.{body}.")).status_code == 401


def test_bad_sub_claims(client):
    for sub in ("abc", "", "1.5", None):
        payload = {"exp": 9999999999} | ({"sub": sub} if sub is not None else {})
        tok = jwt.encode(payload, config.SECRET, algorithm="HS256")
        assert client.get("/api/auth/me", headers=bearer(tok)).status_code == 401, sub


def test_role_claim_is_ignored(client):
    """Il ruolo viene dal DB, non dal token: un token valido di un giocatore con role=master resta un giocatore."""
    tok = token_for(user_id("giocatore1"), role="master")
    h = bearer(tok)
    assert client.get("/api/auth/me", headers=h).json()["role"] == "player"
    assert client.get("/api/campaign", headers=h).status_code == 403


def test_deleted_user_token(client):
    h = login(client, "giocatore6")
    assert client.get("/api/auth/me", headers=h).status_code == 200
    with SessionLocal() as db:
        uid = db.scalar(select(User.id).where(User.username == "giocatore6"))
        db.execute(delete(Character).where(Character.owner_id == uid))
        db.execute(delete(User).where(User.id == uid))
        db.commit()
    r = client.get("/api/auth/me", headers=h)
    assert r.status_code == 401
    assert client.get("/api/characters", headers=h).status_code == 401


def test_login_no_user_enumeration(client, monkeypatch):
    """Utente inesistente e password errata: stesso codice, stesso messaggio e stesso lavoro (bcrypt eseguito)."""
    a = client.post("/api/auth/login", json={"username": "nessuno", "password": "x"})
    b = client.post("/api/auth/login", json={"username": "master", "password": "sbagliata"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()
    calls = []
    real = auth.bcrypt.checkpw
    monkeypatch.setattr(auth.bcrypt, "checkpw", lambda pw, h: calls.append(1) or real(pw, h))
    client.post("/api/auth/login", json={"username": "utente-che-non-esiste", "password": "x"})
    assert calls, "per un utente inesistente bcrypt non viene eseguito: la differenza di tempo rivela chi esiste"


def test_login_injection_payloads(client):
    for u in ("' OR '1'='1", "master' --", "master\" OR 1=1 --", "%", "_aster", "master\x00"):
        r = client.post("/api/auth/login", json={"username": u, "password": "' OR '1'='1"})
        assert r.status_code in (401, 422), u
    r = client.post("/api/auth/login", json={"username": "x" * 10_000, "password": "y" * 100_000})
    assert r.status_code in (401, 422)


def test_login_rate_limited(client):
    for _ in range(auth.LOGIN_MAX_FAILS):
        assert client.post("/api/auth/login", json={"username": "master", "password": "no"}).status_code == 401
    r = client.post("/api/auth/login", json={"username": "master", "password": "no"})
    assert r.status_code == 429 and "Retry-After" in r.headers
    # bloccato anche con la password giusta finché la finestra non scade
    assert client.post("/api/auth/login", json={"username": "master", "password": "master"}).status_code == 429
    # gli altri utenti non sono toccati
    assert client.post("/api/auth/login", json={"username": "giocatore1", "password": "giocatore1"}).status_code == 200


def test_login_rate_limit_resets_on_success(client):
    for _ in range(auth.LOGIN_MAX_FAILS - 1):
        client.post("/api/auth/login", json={"username": "master", "password": "no"})
    assert client.post("/api/auth/login", json={"username": "master", "password": "master"}).status_code == 200
    for _ in range(auth.LOGIN_MAX_FAILS - 1):
        assert client.post("/api/auth/login", json={"username": "master", "password": "no"}).status_code == 401


def test_secret_is_not_a_public_default(tmp_path, monkeypatch):
    """Senza STATISFY_SECRET la chiave non è più una costante nel codice: viene generata e salvata in un file."""
    monkeypatch.delenv("STATISFY_SECRET", raising=False)
    f = tmp_path / "secret"
    monkeypatch.setenv("STATISFY_SECRET_FILE", str(f))
    s1 = config.load_secret()
    assert len(s1) >= 32 and f.read_text().strip() == s1
    assert config.load_secret() == s1  # stabile tra i riavvii
    assert "cambiami" not in config.SECRET
    monkeypatch.setenv("STATISFY_SECRET", "statisfy-dev-secret-cambiami")
    with pytest.raises(RuntimeError):
        config.load_secret()
    monkeypatch.setenv("STATISFY_SECRET", "corta")
    with pytest.raises(RuntimeError):
        config.load_secret()


def test_old_default_secret_tokens_rejected(client):
    tok = token_for(user_id("master"), key="statisfy-dev-secret-cambiami")
    assert client.get("/api/auth/me", headers=bearer(tok)).status_code == 401


def test_cors(client):
    pre = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"}
    evil = client.options("/api/auth/login", headers={"Origin": "https://evil.example", **pre})
    assert "access-control-allow-origin" not in evil.headers
    ok = client.options("/api/auth/login", headers={"Origin": "http://localhost:5174", **pre})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5174"
    r = client.get("/api/rules", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_multiple_sessions_same_user(client):
    """Login in più schede: ogni token è valido in modo indipendente (logout = solo lato client)."""
    a, b = login(client, "giocatore1"), login(client, "giocatore1")
    assert client.get("/api/auth/me", headers=a).status_code == 200
    assert client.get("/api/auth/me", headers=b).status_code == 200


# ---------------------------------------------------------------- autorizzazione (IDOR)

def _player_calls(eric):
    base = f"/api/characters/{eric}"
    return [
        ("GET", base, None),
        ("PATCH", base, {"resources": {"hp": 1, "mp": 1, "sp": 1}}),
        ("POST", f"{base}/level-up", None),
        ("POST", f"{base}/distribute", {"alloc": {"STR": 1}}),
        ("POST", f"{base}/combat/action", {"type": "damage", "amount": 5}),
        ("POST", f"{base}/combat/end-turn", None),
        ("POST", f"{base}/combat/effects", {"name": "X", "kind": "bad", "turns": 2}),
        ("DELETE", f"{base}/combat/effects/0", None),
        ("POST", f"{base}/combat/reset", None),
        ("POST", f"{base}/death", {"hubris": True}),
        ("POST", f"{base}/equipment/equip", {"item_id": "x"}),
        ("POST", f"{base}/equipment/unequip", {"slot": "testa"}),
        ("POST", f"{base}/equipment/move", {"from_slot": "anello1", "to_slot": "anello2"}),
        ("POST", f"/api/table/characters/{eric}/rolls", {"reason": "furto"}),
    ]


def test_player_cannot_touch_other_characters(client, master, p1):
    eric = cid(client, master, "Eric")
    before = client.get(f"/api/characters/{eric}", headers=master).json()
    for method, url, body in _player_calls(eric):
        r = client.request(method, url, headers=p1, json=body)
        assert r.status_code == 404, (method, url, r.status_code, r.text)
    assert client.request("DELETE", f"/api/characters/{eric}", headers=p1).status_code == 403
    after = client.get(f"/api/characters/{eric}", headers=master).json()
    assert after == before
    assert all(c["owner_id"] == user_id("giocatore1") for c in client.get("/api/characters", headers=p1).json())


def test_nonexistent_character_same_as_foreign(client, p1):
    """Un PG altrui e uno inesistente danno la stessa risposta: niente enumerazione degli id."""
    for method, url, body in _player_calls(999_999):
        r = client.request(method, url, headers=p1, json=body)
        assert r.status_code == 404, (method, url)


def test_player_rolls_and_requests_isolation(client, master, p1, p2):
    eric = cid(client, master, "Eric")
    kelvin = cid(client, master, "Kelvin")
    r = client.post(f"/api/table/characters/{eric}/rolls", headers=p2, json={"reason": "di Eric"})
    assert r.status_code == 201
    secret = client.post("/api/table/rolls", headers=master, json={"reason": "segreto", "secret": True}).json()
    public = client.post("/api/table/rolls", headers=master, json={"reason": "pubblico"}).json()
    seen = client.get("/api/table/rolls", headers=p1).json()
    assert all(x["char_id"] == kelvin for x in seen)
    seen = client.get(f"/api/table/rolls?char_id={eric}", headers=p1).json()
    assert seen == []
    ids = {x["id"] for x in client.get("/api/table/rolls?limit=200", headers=p1).json()}
    assert secret["id"] not in ids and public["id"] not in ids
    # richieste: il giocatore vede solo le sue e non può risolvere quelle di un altro PG
    q = client.post("/api/table/requests", headers=master, json={"char_id": eric, "what": "Percezione"}).json()
    assert all(x["char_id"] == kelvin for x in client.get("/api/table/requests", headers=p1).json())
    r = client.post(f"/api/table/characters/{kelvin}/rolls", headers=p1, json={"request_id": q["id"]})
    assert r.status_code == 201 and r.json()["request_id"] is None
    still = next(x for x in client.get("/api/table/requests", headers=master).json() if x["id"] == q["id"])
    assert still["status"] == "aperta"


MASTER_ONLY = [
    ("GET", "/api/campaign", None), ("POST", "/api/campaign/session", None),
    ("GET", "/api/npcs", None), ("POST", "/api/npcs", {"name": "X"}), ("PATCH", "/api/npcs/1", {"name": "X"}),
    ("POST", "/api/npcs/1/interactions", {"text": "x"}),
    ("GET", "/api/issues", None), ("PATCH", "/api/issues/1", {"resolved": True}),
    ("GET", "/api/forge/meta", None), ("GET", "/api/forge/library", None), ("GET", "/api/forge/board", None),
    ("POST", "/api/forge/preview", {"kind": "skills", "draft": {}}),
    ("POST", "/api/forge/entries", {"kind": "skills", "draft": {}}),
    ("DELETE", "/api/forge/entries/1", None),
    ("POST", "/api/forge/drop-profile", {"creatures": []}), ("POST", "/api/forge/drop-roll", {"profile": {}}),
    ("GET", "/api/forge/entries/1/assign-preview?char_id=1", None),
    ("POST", "/api/forge/entries/1/assign", {"char_id": 1}),
    ("POST", "/api/forge/encounters/1/live", {"action": "start"}),
    ("GET", "/api/forge/encounters/1/exp", None), ("POST", "/api/forge/encounters/1/close", {"mode": "intera"}),
    ("POST", "/api/table/rolls", {"reason": "x"}),
    ("POST", "/api/table/requests", {"char_id": 1, "what": "xx"}), ("DELETE", "/api/table/requests/1", None),
]


@pytest.mark.parametrize("method,url,body", MASTER_ONLY)
def test_master_only_endpoints(client, p1, method, url, body):
    assert client.request(method, url, headers=p1, json=body).status_code == 403
    assert client.request(method, url, json=body).status_code == 401


def test_import_master_only(client, p1):
    files = {"file": ("a.xlsx", b"x", "application/octet-stream")}
    assert client.post("/api/import/excel", headers=p1, files=files).status_code == 403


def test_player_create_for_other_owner(client, p1):
    body = {"name": "Intruso", "classe_id": "guerriero", "regno_id": "valeria",
            "stats": {"STR": 15, "DEX": 15, "VIT": 15, "INT": 15}, "owner_id": user_id("giocatore2")}
    assert client.post("/api/characters", headers=p1, json=body).status_code == 403


@pytest.mark.parametrize("field,value,code", [
    ("owner_id", 2, 422), ("id", 1, 422), ("name", "Nuovo", 422), ("classe", "Dio", 422),
    ("level", 999, 403), ("exp_pct", 99, 403), ("stats", [], 403), ("corone", 10 ** 6, 403),
    ("inventory", [], 403), ("titles", [], 403), ("item_bonus", {"hp": 10 ** 6}, 403), ("equip", {}, 403),
    ("magia", {"nucleo": 9}, 403), ("pvp", "Rosso", 403), ("gilda", {"nome": "X"}, 403),
    ("death", None, 422), ("version", 1, 422), ("password_hash", "x", 422),
])
def test_player_patch_forbidden_fields(client, p1, field, value, code):
    kid = cid(client, p1, "Kelvin")
    before = client.get(f"/api/characters/{kid}", headers=p1).json()
    r = client.patch(f"/api/characters/{kid}", headers=p1, json={field: value})
    assert r.status_code == code, r.text
    assert client.get(f"/api/characters/{kid}", headers=p1).json() == before


def test_master_cannot_change_owner_or_name(client, master):
    kid = cid(client, master, "Kelvin")
    for body in ({"owner_id": 1}, {"name": "Altro"}, {"classe": "X"}, {"id": 5}):
        assert client.patch(f"/api/characters/{kid}", headers=master, json=body).status_code == 422


# ---------------------------------------------------------------- iniezione / XSS memorizzato

XSS = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "javascript:alert(1)", "{{7*7}}", "${7*7}"]


def test_stored_xss_payloads_are_returned_as_inert_json(client, master, p1):
    kid = cid(client, p1, "Kelvin")
    for payload in XSS:
        r = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"reason": payload[:120]})
        assert r.status_code == 201 and r.json()["reason"] == payload[:120]
        assert r.headers["content-type"].startswith("application/json")
        r = client.post(f"/api/characters/{kid}/combat/effects", headers=p1,
                        json={"name": payload[:60], "kind": "bad", "turns": 1, "text": payload})
        assert r.status_code == 200 and r.json()["combat"]["effects"][-1]["text"] == payload
        n = client.post("/api/npcs", headers=master, json={"name": payload, "secret": payload}).json()
        assert n["name"] == payload


def test_sql_injection_strings_stored_verbatim(client, master):
    evil = "Robert'); DROP TABLE characters;--"
    n = client.post("/api/npcs", headers=master, json={"name": evil, "knows": "' OR 1=1 --"}).json()
    assert n["name"] == evil
    assert len(client.get("/api/characters", headers=master).json()) >= 6
    r = client.get("/api/table/rolls?char_id=1%20OR%201=1", headers=master)
    assert r.status_code == 422


def test_backend_has_no_textual_sql():
    """Nessuna query SQL costruita come testo: solo l'ORM (eccezione: la DDL costante della migrazione in db.py)."""
    app_dir = ROOT / "backend" / "app"
    pat = re.compile(r"\btext\(|exec_driver_sql|\.execute\(\s*f?[\"']")
    hits = []
    for f in app_dir.rglob("*.py"):
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if pat.search(line) and "_text(" not in line and f.name != "db.py":
                hits.append(f"{f.name}:{i}: {line.strip()}")
    assert hits == []


def test_frontend_has_no_html_sinks():
    """Nel frontend i testi dei giocatori passano solo da JSX (escape automatico di React)."""
    src = ROOT / "frontend" / "src"
    if not src.exists():
        pytest.skip("frontend assente")
    pat = re.compile(r"dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML|insertAdjacentHTML|document\.write|"
                     r"\beval\(|new Function\(|srcDoc=|href=\{")
    hits = [f"{f.relative_to(src)}:{i}" for f in [*src.rglob("*.ts"), *src.rglob("*.tsx")]
            for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1) if pat.search(line)]
    assert hits == []


def test_roll_reason_length_limit(client, p1):
    kid = cid(client, p1, "Kelvin")
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"reason": "x" * 121})
    assert r.status_code == 422
    with SessionLocal() as db:
        assert all(len(x.reason) <= 120 for x in db.scalars(select(Roll)))
