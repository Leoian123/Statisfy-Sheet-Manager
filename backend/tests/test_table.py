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
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"reason": "Prova", "call": "sopra"})
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
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"reason": "Domare il lupo", "call": "sotto", "mods": mods})
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
        r = client.post(url, headers=p1, json={"call": "sopra", "mods": [m]})
        assert r.status_code == 422, (m, r.text)
        assert isinstance(r.json()["detail"], str)
    assert client.get("/api/table/rolls", headers=p1).json() == []


def test_fortuna_for_dante(client, master):
    did = char_id(client, master, "Dante")
    p6 = login(client, "giocatore6")
    r = client.post(f"/api/table/characters/{did}/rolls", headers=p6,
                    json={"call": "sopra", "mods": [{"kind": "Fortuna", "name": "Bonus Fortuna sui tiri", "mod": 13},
                                   {"kind": "Talento", "name": "Re dei Giochi", "mod": 13}]})
    assert r.status_code == 201, r.text
    assert r.json()["total"] == r.json()["natural"] + 26


def test_permissions(client, master, p1, p2):
    kid = kelvin_id(client, p1)
    # un altro giocatore non tira per Kelvin
    assert client.post(f"/api/table/characters/{kid}/rolls", headers=p2, json={"call": "sopra"}).status_code == 404
    # il Master sì
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=master, json={"reason": "Per conto suo", "call": "sotto"})
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
    other = client.post(f"/api/table/characters/{eric}/rolls", headers=p2, json={"call": "sopra", "request_id": q["id"]}).json()
    assert other["request_id"] is None
    assert client.get("/api/table/requests?status=aperta", headers=p1).json()[0]["id"] == q["id"]
    roll = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"reason": "Domare il lupo", "call": "sotto", "request_id": q["id"]}).json()
    assert roll["request_id"] == q["id"]
    reqs = client.get("/api/table/requests", headers=master).json()
    assert reqs[0]["status"] == "risolta" and reqs[0]["roll_id"] == roll["id"] and reqs[0]["roll_total"] == roll["total"]
    assert client.get("/api/table/requests?status=aperta", headers=p1).json() == []
    # una richiesta già risolta non si risolve di nuovo
    again = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"call": "sopra", "request_id": q["id"]}).json()
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
    client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"call": "sopra"})
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


# ---- Critici del d100: dichiarazione sopra/sotto, conta il naturale ----

def _dice_for(natural):
    """(decine, unità) che danno quel naturale (100 = 0, 0)."""
    return (0, 0) if natural == 100 else divmod(natural, 10)


CRIT_CASES = [
    ("sopra", 90, None), ("sopra", 91, "critico"), ("sopra", 99, "critico"), ("sopra", 100, "supercritico"),
    ("sopra", 1, None), ("sopra", 9, None), ("sopra", 50, None),
    ("sotto", 1, "supercritico"), ("sotto", 2, "critico"), ("sotto", 9, "critico"), ("sotto", 10, None),
    ("sotto", 100, None), ("sotto", 91, None), ("sotto", 50, None),
]


def test_crit_of_table():
    for call, nat, crit in CRIT_CASES:
        assert table.crit_of(nat, call) == crit, (call, nat)
    assert table.crit_of(100, None) is None and table.crit_of(1, None) is None


def test_character_roll_crit_edges(client, p1, monkeypatch):
    kid = kelvin_id(client, p1)
    url = f"/api/table/characters/{kid}/rolls"
    for call, nat, crit in CRIT_CASES:
        fixed_dice(monkeypatch, *_dice_for(nat))
        b = client.post(url, headers=p1, json={"call": call}).json()
        assert (b["natural"], b["call"], b["crit"]) == (nat, call, crit), (call, nat, b)
    # conta il naturale, non il totale: 95 naturale con −20 resta critico sopra; 50 con +60 non lo è
    fixed_dice(monkeypatch, 9, 5)
    b = client.post(url, headers=p1, json={"call": "sopra", "mods": [{"kind": "Skill", "name": "Domare", "mod": -20}]}).json()
    assert (b["total"], b["crit"]) == (75, "critico")
    fixed_dice(monkeypatch, 5, 0)
    b = client.post(url, headers=p1, json={"call": "sopra", "mods": [{"kind": "Skill", "name": "Domare", "mod": 60}]}).json()
    assert (b["total"], b["crit"]) == (110, None)
    # nel registro restano call e crit
    first = client.get("/api/table/rolls?limit=200", headers=p1).json()[-1]
    assert (first["call"], first["natural"], first["crit"]) == ("sopra", 90, None)


def test_character_roll_call_required(client, p1, master):
    kid = kelvin_id(client, p1)
    url = f"/api/table/characters/{kid}/rolls"
    for body in ({}, {"reason": "x"}, {"call": None}, {"call": ""}, {"call": "Sopra"}, {"call": "su"}, {"call": 1}):
        r = client.post(url, headers=p1, json=body)
        assert r.status_code == 422, (body, r.text)
        assert isinstance(r.json()["detail"], str)
    # vale anche quando tira il Master per conto del PG
    assert client.post(url, headers=master, json={}).status_code == 422
    assert client.get("/api/table/rolls", headers=p1).json() == []


def test_master_roll_call_optional(client, master, monkeypatch):
    fixed_dice(monkeypatch, 0, 0, 0, 1, 0, 1)
    b = client.post("/api/table/rolls", headers=master, json={"reason": "Meteo"}).json()
    assert (b["natural"], b["call"], b["crit"]) == (100, None, None)
    b = client.post("/api/table/rolls", headers=master, json={"call": "sotto", "secret": True}).json()
    assert (b["natural"], b["call"], b["crit"], b["secret"]) == (1, "sotto", "supercritico", True)
    b = client.post("/api/table/rolls", headers=master, json={"call": "sopra"}).json()
    assert (b["natural"], b["crit"]) == (1, None)
    assert client.post("/api/table/rolls", headers=master, json={"call": "boh"}).status_code == 422


def test_request_shows_roll_crit(client, master, p1, monkeypatch):
    kid = kelvin_id(client, p1)
    q = client.post("/api/table/requests", headers=master, json={"char_id": kid, "what": "Scalare"}).json()
    fixed_dice(monkeypatch, 9, 7)
    client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"call": "sopra", "request_id": q["id"]})
    r = client.get("/api/table/requests", headers=master).json()[0]
    assert (r["roll_natural"], r["roll_crit"]) == (97, "critico")


def test_existing_rolls_table_gets_new_columns(client, master):
    """Un DB con la tabella `rolls` di prima dei critici (senza call/crit) riceve le colonne all'avvio: i tiri vecchi
    restano con call/crit null e i nuovi le salvano."""
    from sqlalchemy import inspect, text
    from app.db import SessionLocal, engine
    from app.seed import migrate_schema, seed_if_empty
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE rolls"))
        conn.execute(text(
            "CREATE TABLE rolls (id INTEGER PRIMARY KEY, char_id INTEGER, author_id INTEGER NOT NULL, reason VARCHAR(120),"
            " tens INTEGER NOT NULL, units INTEGER NOT NULL, natural INTEGER NOT NULL, mods JSON, total INTEGER NOT NULL,"
            " secret BOOLEAN, request_id INTEGER, created_at VARCHAR(40))"))
        conn.execute(text("INSERT INTO rolls (char_id, author_id, reason, tens, units, natural, mods, total, secret)"
                          " VALUES (NULL, 1, 'vecchio', 4, 2, 42, '[]', 42, 0)"))
    assert "call" not in {c["name"] for c in inspect(engine).get_columns("rolls")}
    with SessionLocal() as db:
        assert seed_if_empty(db) is False
    assert {"call", "crit"} <= {c["name"] for c in inspect(engine).get_columns("rolls")}
    assert migrate_schema(engine) == []  # idempotente
    old = client.get("/api/table/rolls", headers=master).json()
    assert len(old) == 1 and old[0]["reason"] == "vecchio" and old[0]["call"] is None and old[0]["crit"] is None
    assert client.post("/api/table/rolls", headers=master, json={"call": "sopra"}).status_code == 201


def test_combat_log_times_parallel(client, p1):
    """Il registro unico della plancia ordina tiri e combattimento: ogni riga di `combat.log` ha la sua ora in `log_at`."""
    from app import rules
    kid = kelvin_id(client, p1)
    c = client.post(f"/api/characters/{kid}/combat/action", headers=p1, json={"type": "damage", "amount": 5}).json()
    assert len(c["combat"]["log_at"]) == len(c["combat"]["log"]) >= 1 and all(c["combat"]["log_at"])
    c = client.post(f"/api/characters/{kid}/combat/reset", headers=p1).json()
    assert c["combat"]["log"] == []
    c = client.post(f"/api/characters/{kid}/combat/end-turn", headers=p1).json()
    assert len(c["combat"]["log_at"]) == len(c["combat"]["log"])
    # righe vecchie senza ora e log svuotato a mano: si riallinea dalla fine
    combat = {"turn": 2, "log": ["T1 · a", "T1 · b"], "log_at": ["x", "y", "z"]}
    rules.add_log(combat, "c")
    assert combat["log_at"][:2] == ["y", "z"] and len(combat["log_at"]) == 3
    combat = {"turn": 1, "log": ["T1 · a"]}
    rules.add_log(combat, "b")
    assert combat["log_at"][0] == "" and combat["log_at"][1]
    combat = {"turn": 1, "log": [], "log_at": ["vecchia"]}
    for i in range(25):
        rules.add_log(combat, str(i))
    assert len(combat["log"]) == len(combat["log_at"]) == 20 and "vecchia" not in combat["log_at"]
