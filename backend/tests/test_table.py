"""Tavolo: tiri d100 generati dal server e richieste di tiro del Master (/api/table)."""
from app.routers import table
from conftest import login
from test_api import kelvin_id


def char_id(client, h, name):
    return next(c["id"] for c in client.get("/api/characters", headers=h).json() if c["name"] == name)


def fixed_dice(monkeypatch, *values):
    it = iter(values)
    monkeypatch.setattr(table.secrets, "randbelow", lambda n: next(it))


def test_d100_uses_secrets_and_00_0_is_100(client, p1, monkeypatch):
    calls = []

    def fake(n):
        calls.append(n)
        return 0

    monkeypatch.setattr(table.secrets, "randbelow", fake)
    kid = kelvin_id(client, p1)
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"reason": "Prova"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["tens"], body["units"], body["natural"], body["total"]) == (0, 0, 100, 100)
    assert calls == [10, 10]
    assert body["by"] == "giocatore" and body["char_name"] == "Kelvin" and body["author_name"] == "Giocatore 1"


def test_roll_with_mods_total(client, p1, monkeypatch):
    fixed_dice(monkeypatch, 0, 1)  # 01 naturale
    kid = kelvin_id(client, p1)
    mods = [{"kind": "Skill", "name": "Domare", "mod": 12, "text": "Grado VI"},
            {"kind": "Titolo", "name": "Domatore delle Epoche", "mod": -3},
            {"kind": "Skill attiva", "name": "Comando: Battaglia", "mod": 2},
            {"kind": "Talento", "name": "Segugio", "mod": 0}]
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"reason": "Domare il lupo", "mods": mods})
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["natural"] == 1 and b["total"] == 1 + 12 - 3 + 2
    assert [m["name"] for m in b["mods"]] == ["Domare", "Domatore delle Epoche", "Comando: Battaglia", "Segugio"]
    assert b["mods"][1]["text"] == ""


def test_invalid_mods(client, p1):
    kid = kelvin_id(client, p1)
    url = f"/api/table/characters/{kid}/rolls"
    bad = [
        {"kind": "Incantesimo", "name": "Domare", "mod": 1},          # tipo non ammesso
        {"kind": "Skill", "name": "Volare", "mod": 1},                # non nella scheda
        {"kind": "Titolo", "name": "Domare", "mod": 1},               # nome di un altro tipo
        {"kind": "Skill", "name": "Domare", "mod": 1000},             # fuori intervallo
        {"kind": "Skill", "name": "Domare", "mod": -1000},
        {"kind": "Skill", "name": "Domare", "mod": 1.5},              # non intero
        {"kind": "Fortuna", "name": "Bonus Fortuna sui tiri", "mod": 3},  # Kelvin non ha LCK
        {"kind": "Skill", "name": "Domare"},                          # mod mancante
    ]
    for m in bad:
        r = client.post(url, headers=p1, json={"mods": [m]})
        assert r.status_code == 422, (m, r.text)
        assert isinstance(r.json()["detail"], str)
    assert client.get("/api/table/rolls", headers=p1).json() == []


def test_fortuna_for_dante(client, master):
    did = char_id(client, master, "Dante")
    p6 = login(client, "giocatore6")
    r = client.post(f"/api/table/characters/{did}/rolls", headers=p6,
                    json={"mods": [{"kind": "Fortuna", "name": "Bonus Fortuna sui tiri", "mod": 13},
                                   {"kind": "Talento", "name": "Re dei Giochi", "mod": 13}]})
    assert r.status_code == 201, r.text
    assert r.json()["total"] == r.json()["natural"] + 26


def test_permissions(client, master, p1, p2):
    kid = kelvin_id(client, p1)
    # un altro giocatore non tira per Kelvin
    assert client.post(f"/api/table/characters/{kid}/rolls", headers=p2, json={}).status_code == 404
    # il Master sì
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=master, json={"reason": "Per conto suo"})
    assert r.status_code == 201 and r.json()["author_name"] == "Il Narratore" and r.json()["by"] == "giocatore"
    # solo il Master: tiro del Master, richieste, annullamento
    assert client.post("/api/table/rolls", headers=p1, json={}).status_code == 403
    assert client.post("/api/table/requests", headers=p1, json={"char_id": kid, "what": "Furtività"}).status_code == 403
    q = client.post("/api/table/requests", headers=master, json={"char_id": kid, "what": "Furtività"}).json()
    assert client.delete(f"/api/table/requests/{q['id']}", headers=p1).status_code == 403
    # senza login niente
    assert client.get("/api/table/rolls").status_code == 401
    # il giocatore 2 non vede tiri e richieste di Kelvin
    assert client.get("/api/table/rolls", headers=p2).json() == []
    assert client.get("/api/table/requests", headers=p2).json() == []
    assert len(client.get("/api/table/rolls", headers=p1).json()) == 1
    assert len(client.get("/api/table/requests", headers=p1).json()) == 1


def test_request_resolved_by_roll(client, master, p1, p2):
    kid = kelvin_id(client, p1)
    eric = char_id(client, p2, "Eric")
    r = client.post("/api/table/requests", headers=master, json={"char_id": kid, "what": "Domare il lupo", "note": "È spaventato"})
    assert r.status_code == 201
    q = r.json()
    assert q["status"] == "aperta" and q["char_name"] == "Kelvin" and q["roll_id"] is None
    assert client.post("/api/table/requests", headers=master, json={"char_id": 9999, "what": "Niente"}).status_code == 404
    assert client.post("/api/table/requests", headers=master, json={"char_id": kid, "what": "x"}).status_code == 422
    # la richiesta di Kelvin non si risolve tirando per Eric
    other = client.post(f"/api/table/characters/{eric}/rolls", headers=p2, json={"request_id": q["id"]}).json()
    assert other["request_id"] is None
    assert client.get("/api/table/requests?status=aperta", headers=p1).json()[0]["id"] == q["id"]
    roll = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"reason": "Domare il lupo", "request_id": q["id"]}).json()
    assert roll["request_id"] == q["id"]
    reqs = client.get("/api/table/requests", headers=master).json()
    assert reqs[0]["status"] == "risolta" and reqs[0]["roll_id"] == roll["id"] and reqs[0]["roll_total"] == roll["total"]
    assert client.get("/api/table/requests?status=aperta", headers=p1).json() == []
    # una richiesta già risolta non si risolve di nuovo
    again = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"request_id": q["id"]}).json()
    assert again["request_id"] is None
    # annullamento
    q2 = client.post("/api/table/requests", headers=master, json={"char_id": kid, "what": "Ascoltare"}).json()
    assert client.delete(f"/api/table/requests/{q2['id']}", headers=master).status_code == 204
    assert client.delete(f"/api/table/requests/{q2['id']}", headers=master).status_code == 404
    assert [x["id"] for x in client.get("/api/table/requests", headers=p1).json()] == [q["id"]]


def test_secret_rolls_hidden_from_players(client, master, p1, monkeypatch):
    fixed_dice(monkeypatch, 4, 2, 9, 9, 5, 5)
    s = client.post("/api/table/rolls", headers=master, json={"reason": "La guardia nota il furto?", "secret": True})
    assert s.status_code == 201
    assert s.json()["secret"] is True and s.json()["natural"] == 42 and s.json()["char_id"] is None and s.json()["by"] == "master"
    pub = client.post("/api/table/rolls", headers=master, json={"reason": "Meteo"}).json()
    assert pub["natural"] == 99 and pub["secret"] is False
    kid = kelvin_id(client, p1)
    client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={})
    seen = client.get("/api/table/rolls", headers=p1).json()
    assert [r["char_id"] for r in seen] == [kid]
    all_ = client.get("/api/table/rolls", headers=master).json()
    assert len(all_) == 3 and any(r["secret"] for r in all_)
    assert all_[0]["char_name"] == "Kelvin"  # dal più recente
    assert [r["char_id"] for r in client.get(f"/api/table/rolls?char_id={kid}", headers=master).json()] == [kid]


def test_existing_db_gets_new_tables(client, master):
    """Un DB creato prima del tavolo (senza le tabelle dei tiri) le riceve all'avvio senza perdere i dati."""
    from app.db import SessionLocal, engine
    from app.models import Roll, RollRequest
    from app.seed import seed_if_empty
    RollRequest.__table__.drop(engine)
    Roll.__table__.drop(engine)
    with SessionLocal() as db:
        assert seed_if_empty(db) is False
    assert len(client.get("/api/characters", headers=master).json()) == 6
    assert client.post("/api/table/rolls", headers=master, json={}).status_code == 201
