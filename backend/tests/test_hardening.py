"""Regressioni dei problemi trovati dal test d'attacco (insider malevolo) del 21/11/2026."""
import threading

from conftest import login
from test_ki import char_id

J, T = "/api/journal", "/api/tickets"


def page(client, h, **kw):
    return client.post(J, json={"title": "Nota", "body": "testo", **kw}, headers=h)


def ticket(client, h, **kw):
    return client.post(T, json={"kind": "regola", "title": "Domanda", "body": "Testo", **kw}, headers=h)


# 1 — produzione su DB vuoto: niente utenti di sviluppo
def test_production_never_seeds_dev_users(tmp_path, monkeypatch):
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from app import config, seed
    from app.models import User
    monkeypatch.setattr(config, "PRODUCTION", True)
    eng = create_engine(f"sqlite:///{(tmp_path / 'prod.db').as_posix()}")
    with Session(eng) as db:
        assert seed.seed_if_empty(db) is False
        assert db.scalar(select(User).limit(1)) is None


# 2 — surrogati isolati: rifiutati prima di arrivare al database
def test_lone_surrogate_rejected_everywhere(client, p1, p2):
    raw = b'{"title":"x","visibility":"gruppo","tags":["\\udfff"]}'
    r = client.post(J, content=raw, headers={**p1, "Content-Type": "application/json"})
    assert r.status_code == 422
    for body in (b'{"kind":"regola","title":"abc\\ud800","body":"x"}', b'{"title":"\\udc00ok"}'):
        url = T if b"kind" in body else J
        assert client.post(url, content=body, headers={**p1, "Content-Type": "application/json"}).status_code == 422
    # coppie di surrogati valide (emoji) passano
    ok = client.post(J, content='{"title":"Drago \\ud83d\\udc09"}'.encode(), headers={**p1, "Content-Type": "application/json"})
    assert ok.status_code == 201 and ok.json()["title"] == "Drago \U0001F409"
    assert client.get(J, headers=p2).status_code == 200


# 10 — caratteri invisibili e override bidi tolti; una risposta "invisibile" non chiude una richiesta
def test_invisible_unicode_stripped(client, p1, master):
    e = page(client, p1, title="Ma‮rgo​⁦x\x9b", tags=["a​b"]).json()
    assert e["title"] == "Margox" and e["tags"] == ["ab"]
    emoji = page(client, p1, title="Famiglia \U0001F468‍\U0001F469").json()
    assert "‍" in emoji["title"]  # lo zero-width joiner delle emoji resta
    t = ticket(client, p1).json()
    r = client.patch(f"{T}/{t['id']}", json={"status": "respinta", "answer": "​‮ "}, headers=master)
    assert r.status_code == 422


# 3 — un PG nuovo che riceve l'id di uno eliminato non eredita tiri, richieste e collegamenti
def test_deleted_character_leaves_nothing_to_inherit(client, master):
    p6 = login(client, "giocatore6")
    did = char_id(client, master, "Dante")
    roll = client.post(f"/api/table/characters/{did}/rolls", json={"call": "sopra", "reason": "Segreto di Dante"}, headers=p6)
    assert roll.status_code == 201
    client.post("/api/table/requests", json={"char_id": did, "what": "Bluff", "note": "nota del Master"}, headers=master)
    jp = page(client, p6, char_id=did, attachments=[{"kind": "roll", "ref": str(roll.json()["id"])}]).json()
    tk = ticket(client, p6, char_id=did).json()
    assert client.delete(f"/api/characters/{did}", headers=master).status_code == 204

    p3 = login(client, "giocatore3")
    body = {"name": "Nuovo", "classe_id": "guerriero", "stats": {"STR": 20, "DEX": 15, "VIT": 15, "INT": 10},
            "regno_id": "valeria"}
    new = client.post("/api/characters", json=body, headers=p3)
    assert new.status_code == 201, new.text
    nid = new.json()["id"]
    assert nid == did  # SQLite riusa l'id: è proprio il caso pericoloso
    rolls = client.get("/api/table/rolls", params={"char_id": nid}, headers=p3).json()
    assert all(r["reason"] != "Segreto di Dante" for r in rolls)
    assert all(q["char_id"] != nid for q in client.get("/api/table/requests", headers=p3).json())
    # i tiri del PG eliminato non esistono più; diario e richieste perdono solo il collegamento
    assert client.get(f"{J}/{jp['id']}", headers=p6).json()["char_id"] is None
    assert client.get(f"{J}/{jp['id']}", headers=p6).json()["attachments"][0]["label"] == "Segreto di Dante"
    assert client.get(f"{T}/{tk['id']}", headers=p6).json()["char_id"] is None
    assert all(r.get("char_id") != did for r in client.get("/api/table/rolls", headers=master).json())


# 6 — quest della campagna: solo quelle dei propri PG
def test_campaign_quests_not_leaked(client, p1):
    a = client.get(f"{J}/attachables", headers=p1).json()
    assert {q["ref"] for q in a["quest"]} == {"Il Wyrm che non brucia"}
    assert page(client, p1, attachments=[{"kind": "quest", "ref": "Taglia su Dante"}]).status_code == 422


# 11 — le pagine fissate degli altri non scavalcano le proprie
def test_others_pins_do_not_float(client, p1, p2):
    mine = page(client, p1, title="mia").json()
    for i in range(3):
        page(client, p2, title=f"SPAM {i}", visibility="gruppo", pinned=True)
    items = client.get(J, headers=p1).json()["items"]
    assert items[0]["title"] in ("SPAM 2", "mia") and [x["id"] for x in items].index(mine["id"]) <= 3
    page(client, p1, title="mia fissata", pinned=True)
    assert client.get(J, headers=p1).json()["items"][0]["title"] == "mia fissata"


# 4 — elenco paginato in SQL: total corretto con filtri e pagine grandi
def test_journal_sql_paging(client, p1):
    for i in range(30):
        page(client, p1, title=f"Pagina {i}", tags=["pari" if i % 2 == 0 else "dispari"], body="100% vero_" if i == 7 else "x")
    r = client.get(J, params={"tag": "pari", "limit": 5}, headers=p1).json()
    assert r["total"] == 15 and len(r["items"]) == 5
    assert client.get(J, params={"q": "100%"}, headers=p1).json()["total"] == 1  # % letterale, non jolly
    assert client.get(J, params={"q": "o_"}, headers=p1).json()["total"] == 1
    assert client.get(J, params={"q": "%"}, headers=p1).json()["total"] == 1
    assert sorted(client.get(J, headers=p1).json()["tags"]) == ["dispari", "pari"]


# 5 — tetto giornaliero: ritirare non permette di crearne all'infinito
def test_ticket_daily_cap(client, p1, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "TICKET_MAX_PER_DAY", 3)
    for _ in range(3):
        t = ticket(client, p1).json()
        client.patch(f"{T}/{t['id']}", json={"status": "ritirata"}, headers=p1)
    assert ticket(client, p1).status_code == 429


# 7 — tetti atomici anche con richieste contemporanee
def test_caps_hold_under_concurrency(client, p1, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "TICKET_MAX_ACTIVE", 3)
    monkeypatch.setattr(config, "JOURNAL_MAX_ENTRIES", 3)
    codes: list[int] = []
    barrier = threading.Barrier(8)

    def go(fn):
        barrier.wait()
        codes.append(fn().status_code)

    for fn in (lambda: ticket(client, p1), lambda: page(client, p1)):
        codes.clear()
        ths = [threading.Thread(target=go, args=(fn,)) for _ in range(8)]
        [t.start() for t in ths]
        [t.join() for t in ths]
        assert codes.count(201) == 3, codes


# 8 — ritirare non permette di riscrivere una richiesta già in esame
def test_withdraw_cannot_rewrite(client, p1, master):
    t = ticket(client, p1).json()
    client.patch(f"{T}/{t['id']}", json={"status": "in_esame"}, headers=master)
    r = client.patch(f"{T}/{t['id']}", json={"status": "ritirata", "title": "Riscritto", "body": "altro"}, headers=p1)
    assert r.status_code == 409
    assert client.get(f"{T}/{t['id']}", headers=p1).json()["title"] == "Domanda"


# 9 — una seconda promozione aggiorna la decisione della questione
def test_repromote_updates_decision(client, p1, master):
    t = ticket(client, p1).json()
    iid = client.patch(f"{T}/{t['id']}", json={"status": "risolta", "answer": "sì", "promote_issue": True}, headers=master).json()["issue_id"]
    client.patch(f"{T}/{t['id']}", json={"status": "in_esame"}, headers=master)
    client.patch(f"{T}/{t['id']}", json={"status": "risolta", "answer": "no, il contrario", "promote_issue": True}, headers=master)
    it = next(i for i in client.get("/api/issues", headers=master).json() if i["id"] == iid)
    assert it["decision"] == "no, il contrario"


# 13 — messaggio di conflitto generico (non parla di personaggi per una richiesta)
def test_stale_message_is_generic():
    from app.main import stale_handler
    import asyncio
    resp = asyncio.run(stale_handler(None, None))
    assert b"personaggio" not in resp.body


# 14 — giorni d'archivio limitati
def test_archive_days_clamped(monkeypatch):
    import importlib

    from app import config
    monkeypatch.setenv("STATISFY_TICKET_ARCHIVE_DAYS", "1000000000")
    try:
        importlib.reload(config)
        assert config.TICKET_ARCHIVE_DAYS == 3650
    finally:
        monkeypatch.delenv("STATISFY_TICKET_ARCHIVE_DAYS")
        importlib.reload(config)


# 15 — revoca dei token: Esci, Esci da tutti i dispositivi, cambio password
def test_logout_revokes_only_this_token(client):
    a, b = login(client, "giocatore1"), login(client, "giocatore1")
    assert client.post("/api/auth/logout", headers=a).status_code == 204
    assert client.get("/api/auth/me", headers=a).status_code == 401
    assert client.get("/api/auth/me", headers=b).status_code == 200
    assert client.post("/api/auth/logout", headers=a).status_code == 401  # già fuori


def test_logout_all_revokes_every_token(client):
    a, b = login(client, "giocatore1"), login(client, "giocatore1")
    other = login(client, "giocatore2")
    assert client.post("/api/auth/logout-all", headers=a).status_code == 204
    assert client.get("/api/auth/me", headers=a).status_code == 401
    assert client.get("/api/auth/me", headers=b).status_code == 401
    assert client.get("/api/auth/me", headers=other).status_code == 200
    c = login(client, "giocatore1")
    assert client.get("/api/auth/me", headers=c).status_code == 200


def test_password_change_revokes_tokens(client, monkeypatch):
    from app import users
    a = login(client, "giocatore1")
    monkeypatch.setattr(users, "ask_password", lambda: "nuova-password-lunga")
    assert users.main(["passwd", "giocatore1"]) == 0
    assert client.get("/api/auth/me", headers=a).status_code == 401


# 12 — il frontend servito non accetta richieste Range (CVE-2025-62727 di starlette)
def test_spa_ignores_range(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.web import spa_handler
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<div id=root></div>", encoding="utf-8")
    (dist / "assets" / "a.js").write_text("x" * 5000, encoding="utf-8")
    app = FastAPI()
    app.add_api_route("/{path:path}", spa_handler(dist), methods=["GET", "HEAD"])
    r = TestClient(app).get("/assets/a.js", headers={"Range": "bytes=" + ",".join(f"{i}-{i}" for i in range(2000))})
    assert r.status_code == 200 and len(r.content) == 5000
    assert r.headers["content-type"].startswith("text/javascript") or "javascript" in r.headers["content-type"]
