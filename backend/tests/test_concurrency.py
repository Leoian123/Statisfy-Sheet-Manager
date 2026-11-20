"""Multi-sessione e concorrenza: due client sullo stesso PG, doppio invio, SQLite sotto scritture concorrenti.

Le richieste girano in thread separati (TestClient senza contesto = un event loop per richiesta, endpoint sync
nel threadpool). Una Barrier dentro l'handler forza l'interleaving peggiore: entrambe le richieste leggono lo
stato prima che una delle due scriva."""
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import rules
from app.db import SessionLocal
from app.main import app
from app.models import Roll
from app.routers import table
from conftest import login


def cid(client, h, name):
    return next(c["id"] for c in client.get("/api/characters", headers=h).json() if c["name"] == name)


def run_parallel(*calls):
    """Esegue le chiamate in parallelo, ciascuna con il proprio TestClient; ritorna le risposte."""
    def go(fn):
        return fn(TestClient(app, raise_server_exceptions=False))
    with ThreadPoolExecutor(len(calls)) as ex:
        return [f.result(timeout=30) for f in [ex.submit(go, c) for c in calls]]


def barrier_wrap(monkeypatch, obj, name, parties=2):
    """Sostituisce obj.name con una versione che aspetta le altre richieste prima di proseguire."""
    b = threading.Barrier(parties, timeout=5)
    real = getattr(obj, name)

    def wrapped(*a, **kw):
        try:
            b.wait()
        except threading.BrokenBarrierError:
            pass
        return real(*a, **kw)
    monkeypatch.setattr(obj, name, wrapped)


def test_concurrent_damage_no_lost_update(client, p1, master, monkeypatch):
    """Master e giocatore infliggono danno nello stesso istante: o vanno a segno entrambi, o uno riceve 409.
    Prima della correzione entrambi ricevevano 200 ma un danno andava perso."""
    kid = cid(client, p1, "Kelvin")
    url = f"/api/characters/{kid}/combat/action"
    client.post(f"/api/characters/{kid}/combat/reset", headers=p1)  # niente scudi che assorbono il danno
    hp0 =client.get(f"/api/characters/{kid}", headers=p1).json()["resources"]["hp"]
    barrier_wrap(monkeypatch, rules, "apply_damage")
    res = run_parallel(lambda c: c.post(url, headers=p1, json={"type": "damage", "amount": 10}),
                       lambda c: c.post(url, headers=master, json={"type": "damage", "amount": 25}))
    codes = sorted(r.status_code for r in res)
    assert all(c in (200, 409) for c in codes), [r.text for r in res]
    monkeypatch.undo()
    hp = client.get(f"/api/characters/{kid}", headers=p1).json()["resources"]["hp"]
    applied = sum(a for a, r in zip((10, 25), res) if r.status_code == 200)
    assert hp == hp0 - applied, (codes, hp0, hp)
    assert 409 in codes or applied == 35
    if 409 in codes:
        assert "altra sessione" in next(r for r in res if r.status_code == 409).json()["detail"]


def test_concurrent_patch_and_end_turn(client, p1, master, monkeypatch):
    """Il Master cambia le risorse mentre il giocatore chiude il turno: nessuno dei due sovrascrive l'altro in silenzio."""
    kid = cid(client, p1, "Kelvin")
    base = f"/api/characters/{kid}"
    client.patch(base, headers=master, json={"resources": {"hp": 100, "mp": 0, "sp": 0}})
    shared = threading.Barrier(2, timeout=5)
    for name in ("end_turn", "resource_errors"):  # end_turn (giocatore) e PATCH (Master) aspettano la stessa barriera
        real = getattr(rules, name)

        def wrapped(*a, _real=real, **kw):
            try:
                shared.wait()
            except threading.BrokenBarrierError:
                pass
            return _real(*a, **kw)
        monkeypatch.setattr(rules, name, wrapped)
    res = run_parallel(lambda c: c.post(f"{base}/combat/end-turn", headers=p1),
                       lambda c: c.patch(base, headers=master, json={"resources": {"hp": 50, "mp": 0, "sp": 0}}))
    monkeypatch.undo()
    a, b = res[0], res[1]
    assert {a.status_code, b.status_code} <= {200, 409}, (a.text, b.text)
    final = client.get(base, headers=p1).json()
    if a.status_code == b.status_code == 200:
        # entrambi a segno: il turno è avanzato E l'HP è quello del Master (non ripristinato a 100)
        assert final["resources"]["hp"] == 50 and final["combat"]["turn"] >= 2
    else:
        winner = a if a.status_code == 200 else b
        assert final["resources"] == winner.json()["resources"]


def test_double_answer_to_roll_request_resolves_once(client, p1, master, monkeypatch):
    kid = cid(client, p1, "Kelvin")
    q = client.post("/api/table/requests", headers=master, json={"char_id": kid, "what": "Percezione"}).json()
    barrier_wrap(monkeypatch, table, "_now")
    url = f"/api/table/characters/{kid}/rolls"
    res = run_parallel(lambda c: c.post(url, headers=p1, json={"call": "sopra", "request_id": q["id"], "reason": "a"}),
                       lambda c: c.post(url, headers=p1, json={"call": "sotto", "request_id": q["id"], "reason": "b"}))
    monkeypatch.undo()
    assert all(r.status_code in (201, 409) for r in res), [r.text for r in res]
    linked = [r.json() for r in res if r.status_code == 201 and r.json()["request_id"] == q["id"]]
    assert len(linked) == 1, [r.json() for r in res]
    with SessionLocal() as db:
        n = db.scalar(select(func.count()).select_from(Roll).where(Roll.request_id == q["id"]))
    assert n == 1
    req = next(x for x in client.get("/api/table/requests", headers=master).json() if x["id"] == q["id"])
    assert req["status"] == "risolta" and req["roll_id"] == linked[0]["id"]


def test_double_close_encounter(client, master, monkeypatch):
    chars = client.get("/api/forge/meta", headers=master).json()["characters"]
    eric = next(c for c in chars if c["name"] == "Eric")
    d = {"name": "Doppio", "place": "Qui", "env": "Foresta", "party": [eric["id"]], "level": 100,
         "creatures": [{"name": "Lupo", "level": 110, "rarity": "Leggendario", "size": "Normale", "count": 2}]}
    eid = client.post("/api/forge/entries", headers=master, json={"kind": "encounters", "draft": d}).json()["entry"]["id"]
    before = client.get(f"/api/characters/{eric['id']}", headers=master).json()
    from app.routers import forge as forge_router
    barrier_wrap(monkeypatch, forge_router, "_exp_rows")
    url = f"/api/forge/encounters/{eid}/close"
    res = run_parallel(lambda c: c.post(url, headers=master, json={"mode": "intera"}),
                       lambda c: c.post(url, headers=master, json={"mode": "intera"}))
    monkeypatch.undo()
    codes = sorted(r.status_code for r in res)
    assert codes == [200, 409], [r.text for r in res]
    after = client.get(f"/api/characters/{eric['id']}", headers=master).json()
    gained = (after["level"] - before["level"]) * 100 + after["exp_pct"] - before["exp_pct"]
    assert gained == 216  # una sola volta, non 432


def test_sqlite_concurrent_writes(client):
    """Molte scritture concorrenti da utenti diversi: nessun «database is locked», nessun 500, conteggi esatti."""
    heads = {u: login(client, u) for u in ["master"] + [f"giocatore{i}" for i in range(1, 7)]}
    chars = {c["owner_name"]: c["id"] for c in client.get("/api/characters", headers=heads["master"]).json()}
    users = [f"giocatore{i}" for i in range(1, 7)]
    ids = {u: chars[f"Giocatore {u[-1]}"] for u in users}
    with SessionLocal() as db:
        n0 = db.scalar(select(func.count()).select_from(Roll))

    def worker(u):
        def call(c):
            out = []
            for i in range(8):
                out.append(c.post(f"/api/table/characters/{ids[u]}/rolls", headers=heads[u], json={"call": "sopra", "reason": f"{u}-{i}"}).status_code)
                out.append(c.post(f"/api/characters/{ids[u]}/combat/end-turn", headers=heads[u]).status_code)
            return out
        return call

    res = run_parallel(*[worker(u) for u in users],
                       lambda c: [c.post("/api/table/rolls", headers=heads["master"], json={"reason": str(i)}).status_code
                                  for i in range(8)])
    flat = [s for r in res for s in r]
    assert set(flat) <= {200, 201}, flat
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Roll)) == n0 + 6 * 8 + 8


@pytest.mark.parametrize("n", [5])
def test_parallel_logins(client, n):
    res = run_parallel(*[(lambda c: c.post("/api/auth/login", json={"username": "giocatore1", "password": "giocatore1"}))
                         for _ in range(n)])
    assert all(r.status_code == 200 for r in res)
    tokens = {r.json()["token"] for r in res}
    for t in tokens:
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {t}"}).status_code == 200


def test_version_column_added_to_existing_db(tmp_path):
    """I DB creati prima del blocco ottimistico ricevono la colonna `version` all'avvio, senza perdere dati."""
    from sqlalchemy import create_engine, inspect, text

    from app.db import Base, ensure_columns
    eng = create_engine(f"sqlite:///{(tmp_path / 'old.db').as_posix()}")
    Base.metadata.create_all(eng)
    with eng.begin() as conn:
        conn.execute(text("ALTER TABLE characters DROP COLUMN version"))
        conn.execute(text("ALTER TABLE forge_entries DROP COLUMN version"))
    assert "version" not in {c["name"] for c in inspect(eng).get_columns("characters")}
    assert sorted(ensure_columns(eng)) == ["characters.version", "forge_entries.version"]
    assert "version" in {c["name"] for c in inspect(eng).get_columns("characters")}
    assert ensure_columns(eng) == []  # idempotente
    eng.dispose()
