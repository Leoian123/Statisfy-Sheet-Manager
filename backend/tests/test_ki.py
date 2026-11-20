"""Risorsa KI (decisa dal Master): KI max = 100 + KI×8, solo per i PG con la statistica avanzata KI."""
from conftest import login
from test_api import kelvin_id

from app import rules


def char_id(client, h, name):
    return next(c["id"] for c in client.get("/api/characters", headers=h).json() if c["name"] == name)


def get(client, h, cid):
    return client.get(f"/api/characters/{cid}", headers=h).json()


def der(c, key):
    return next((d for d in c["derived"] if d["key"] == key), None)


def test_ki_max_corax(client, master):
    c = get(client, master, char_id(client, master, "Corax"))
    assert c["totals"]["KI"] == 729
    ki = der(c, "ki")
    assert ki["value"] == 5932 and ki["formula"] == "100 + KI×8" and ki["fmt"] == "int"
    assert c["resources"]["ki"] == 5932


def test_pg_without_ki_unchanged(client, master):
    for name in ("Kelvin", "Eric", "Deniel", "Connor", "Dante"):
        c = get(client, master, char_id(client, master, name))
        assert der(c, "ki") is None and der(c, "kiCombat") is None
        assert set(c["resources"]) == {"hp", "mp", "sp"}
    kid = kelvin_id(client, master)
    r = client.post(f"/api/characters/{kid}/combat/end-turn", headers=master).json()
    assert "ki" not in r["resources"] and "KI" not in r["combat"]["log"][-1]
    # Un KI inviato a chi non ha la statistica è un errore
    r = client.patch(f"/api/characters/{kid}", json={"resources": {"hp": 1, "mp": 1, "sp": 1, "ki": 5}}, headers=master)
    assert r.status_code == 422 and "KI" in r.json()["detail"]


def test_ki_end_turn_regen(client):
    h = login(client, "giocatore3")
    cid = char_id(client, h, "Corax")
    c = get(client, h, cid)
    regen = der(c, "kiCombat")["value"]  # VIT 505 / 30 = 16,83 → 17
    assert c["totals"]["VIT"] == 505 and rules.js_round(regen) == 17
    res = {**c["resources"], "ki": 5000}
    assert client.patch(f"/api/characters/{cid}", json={"resources": res}, headers=h).status_code == 200
    r = client.post(f"/api/characters/{cid}/combat/end-turn", headers=h).json()
    assert r["resources"]["ki"] == 5017 and "KI +17" in r["combat"]["log"][-1]
    # Senza superare il massimo
    client.patch(f"/api/characters/{cid}", json={"resources": {**res, "ki": 5925}}, headers=h)
    r = client.post(f"/api/characters/{cid}/combat/end-turn", headers=h).json()
    assert r["resources"]["ki"] == 5932 and "KI +7" in r["combat"]["log"][-1]


def test_ki_patch_validation(client):
    h = login(client, "giocatore3")
    cid = char_id(client, h, "Corax")
    c = get(client, h, cid)
    r = client.patch(f"/api/characters/{cid}", json={"resources": {**c["resources"], "ki": 6000}}, headers=h)
    assert r.status_code == 422 and "KI oltre il massimo" in r.json()["detail"]
    r = client.patch(f"/api/characters/{cid}", json={"resources": {**c["resources"], "ki": -1}}, headers=h)
    assert r.status_code == 422
    # Senza ki nel corpo il KI salvato resta
    client.patch(f"/api/characters/{cid}", json={"resources": {**c["resources"], "ki": 100}}, headers=h)
    r = client.patch(f"/api/characters/{cid}", json={"resources": {"hp": 10, "mp": 10, "sp": 10}}, headers=h)
    assert r.status_code == 200 and r.json()["resources"] == {"hp": 10, "mp": 10, "sp": 10, "ki": 100}


def test_ki_death(client):
    h = login(client, "giocatore3")
    cid = char_id(client, h, "Corax")
    c = get(client, h, cid)
    client.patch(f"/api/characters/{cid}", json={"resources": {**c["resources"], "ki": 300}}, headers=h)
    r = client.post(f"/api/characters/{cid}/death", json={"respawn": "here", "hubris": False}, headers=h).json()
    assert r["resources"]["hp"] == 1 and r["resources"]["ki"] == 300
    r = client.post(f"/api/characters/{cid}/death", json={"respawn": "checkpoint", "hubris": False}, headers=h).json()
    assert r["resources"]["ki"] == 2966 and "KI 2.966" in r["combat"]["log"][-1]


def test_master_adds_and_removes_ki(client, master):
    kid = kelvin_id(client, master)
    c = get(client, master, kid)
    stats = c["stats"] + [{"code": "KI", "name": "KI", "kind": "avanzata", "iniziale": 5, "creazione": 0,
                           "investiti": 0, "levelup": 0, "altro": 0, "titoli": 0, "note": None}]
    r = client.patch(f"/api/characters/{kid}", json={"stats": stats}, headers=master)
    assert r.status_code == 200, r.text
    assert r.json()["resources"]["ki"] == 140  # 100 + 5×8, parte dal massimo
    r = client.patch(f"/api/characters/{kid}", json={"stats": c["stats"]}, headers=master).json()
    assert "ki" not in r["resources"]


def test_migration_fills_ki(client, master):
    from app.db import SessionLocal
    from app.models import Character
    from app.seed import migrate
    from sqlalchemy import select
    with SessionLocal() as db:
        corax = db.scalars(select(Character).where(Character.name == "Corax")).one()
        corax.resources = {"hp": 10, "mp": 10, "sp": 10}
        db.commit()
        assert migrate(db) == 1
        db.refresh(corax)
        assert corax.resources == {"hp": 10, "mp": 10, "sp": 10, "ki": 5932}
        assert migrate(db) == 0


def test_preview_counts_starting_equipment(client):
    stats = [{"code": c, "iniziale": 10, "creazione": v} for c, v in (("STR", 10), ("DEX", 5), ("VIT", 5), ("INT", 0))]
    base = {d["key"]: d["value"] for d in client.post("/api/rules/preview", json={"stats": stats}).json()["derived"]}
    r = client.post("/api/rules/preview", json={"stats": stats, "classe_id": "guerriero"})
    d = {x["key"]: x["value"] for x in r.json()["derived"]}
    assert base["blocco"] == 0 and d["blocco"] == 20.5  # Scudo di Legno 20 + STR 20/40
    assert d["difesa"] == rules.clean(15 / 10 + 5 * (1 + 15 / 100))  # Armatura di Cuoio Rinforzato: Difesa 5
    # Stesse derivate del PG creato davvero
    h = login(client, "giocatore2")
    body = {"name": "Prova", "classe_id": "guerriero", "stats": {"STR": 20, "DEX": 15, "VIT": 15, "INT": 10},
            "regno_id": "valeria"}
    c = client.post("/api/characters", json=body, headers=h).json()
    assert {x["key"]: x["value"] for x in c["derived"]} == d
    assert client.post("/api/rules/preview", json={"stats": stats, "classe_id": "boh"}).status_code == 422


def test_spend_ki(client):
    h = login(client, "giocatore3")
    cid = char_id(client, h, "Corax")
    r = client.post(f"/api/characters/{cid}/combat/action", json={"type": "spend_ki", "amount": 932}, headers=h)
    assert r.status_code == 200 and r.json()["resources"]["ki"] == 5000
    r = client.post(f"/api/characters/{cid}/combat/action", json={"type": "spend_ki", "amount": 5001}, headers=h)
    assert r.status_code == 422 and "KI insufficienti" in r.json()["detail"]
    kid = char_id(client, login(client, "giocatore1"), "Kelvin")
    r = client.post(f"/api/characters/{kid}/combat/action", json={"type": "spend_ki", "amount": 1},
                    headers=login(client, "giocatore1"))
    assert r.status_code == 422 and "non ha la statistica KI" in r.json()["detail"]
