"""«Usa abilità» dalla plancia, senza scontro: costi, ricarica, bersagli (a voce, PG, creatura dell'incontro), permessi."""
from conftest import login

from app.mech_templates import TEMPLATES

TPL = {t["cat"]: t["mech"] for t in TEMPLATES}


def give(client, master, char_id, name, mech=None, **extra):
    c = client.get(f"/api/characters/{char_id}", headers=master).json()
    item = {"name": name, "effect": extra.pop("effect", ""), "lvl": 3, "pct": 0, "cost": extra.pop("cost", ""), "cd": 0, **extra}
    if mech:
        item["mech"] = mech
    r = client.patch(f"/api/characters/{char_id}", json={"active_skills": c["active_skills"] + [item]}, headers=master)
    assert r.status_code == 200, r.text


def test_list_and_preview_and_use_on_spoken_target(client, master):
    give(client, master, 1, "Dardo", {**TPL[1], "cooldown": {"valore": 2, "unita": "turni"}})
    out = client.get("/api/characters/1/abilita", headers=master).json()
    abs_ = out["abilita"]
    assert any(a["nome"] == "Dardo" for a in abs_) and any(a["base"] for a in abs_)
    assert any(p["nome"] == "Eric" for p in out["bersagli"]["pg"])
    body = {"abilita": "Dardo", "bersaglio": {"tipo": "voce", "nome": "Golem", "difesa": 0}}
    p = client.post("/api/characters/1/abilita/anteprima", json=body, headers=master).json()
    assert p["stima"]["Golem"]["danno"][0] > 0 and p["colpire"] is not None
    mp0 = client.get("/api/characters/1", headers=master).json()["resources"]["mp"]
    r = client.post("/api/characters/1/abilita", json={**body, "tiri": {"colpo:bersaglio": 1}}, headers=master)
    assert r.status_code == 200, r.text
    c = r.json()["character"]
    assert c["resources"]["mp"] == mp0 - 30
    assert {"name": "Dardo", "turns": 2} in c["combat"]["cooldowns"]
    assert any("Golem" in line for line in c["combat"]["log"])
    assert not any("999" in line for line in c["combat"]["log"])  # vita fittizia del bersaglio a voce
    # in ricarica: non si riusa finché il turno non scala
    r = client.post("/api/characters/1/abilita", json=body, headers=master)
    assert r.status_code == 422 and "ricarica" in r.json()["detail"]


def test_heal_another_pg_and_damage_forbidden_to_player(client, master):
    give(client, master, 2, "Cura", TPL[5])
    give(client, master, 2, "Dardo", TPL[1])
    client.patch("/api/characters/1", json={"resources": {"hp": 100}}, headers=master)
    p2 = login(client, "giocatore2")  # Eric
    r = client.post("/api/characters/2/abilita", json={"abilita": "Cura", "bersaglio": {"tipo": "pg", "id": 1}}, headers=p2)
    assert r.status_code == 200, r.text
    assert client.get("/api/characters/1", headers=master).json()["resources"]["hp"] > 100
    # un giocatore non usa le abilità di altri PG
    p1 = login(client, "giocatore1")
    assert client.post("/api/characters/2/abilita", json={"abilita": "Cura"}, headers=p1).status_code == 404


def test_shield_on_self_becomes_panel_effect(client, master):
    give(client, master, 1, "Scudo", TPL[9])
    r = client.post("/api/characters/1/abilita", json={"abilita": "Scudo", "bersaglio": {"tipo": "pg", "id": 1}}, headers=master)
    assert r.status_code == 200, r.text
    eff = r.json()["character"]["combat"]["effects"]
    assert any(e["name"] == "Scudo" and e.get("absorb") for e in eff)


def test_damage_creature_of_live_encounter(client, master):
    draft = {"name": "Imboscata", "place": "Bosco", "party": [1], "level": 50,
             "creatures": [{"name": "Bandito", "count": 2, "rarity": "Comune", "level": 5, "size": "Normale"}]}
    e = client.post("/api/forge/entries", json={"kind": "encounters", "draft": draft}, headers=master).json()["entry"]
    client.post(f"/api/forge/encounters/{e['id']}/live", json={"action": "start"}, headers=master)
    give(client, master, 1, "Dardo", TPL[1])
    cr = client.get("/api/characters/1/abilita", headers=master).json()["bersagli"]["creature"]
    assert cr and cr[0]["nome"] == "Bandito" and cr[0]["count"] == 2
    body = {"abilita": "Dardo", "bersaglio": {"tipo": "creatura", "id": e["id"], "index": 0}, "tiri": {"colpo:bersaglio": 1}}
    r = client.post("/api/characters/1/abilita", json=body, headers=master)
    assert r.status_code == 200, r.text
    lib = client.get("/api/forge/library", headers=master).json()
    hp = next(x for x in lib if x["id"] == e["id"])["data"]["live"]["hp"][0]
    full = next(x for x in lib if x["id"] == e["id"])["data"]["creatures"][0]["hp"] * 2
    assert hp < full


def test_text_ability_pays_cost_and_logs(client, master):
    give(client, master, 1, "Richiamo", cost="20 MP", effect="Chiama un animale")
    mp0 = client.get("/api/characters/1", headers=master).json()["resources"]["mp"]
    r = client.post("/api/characters/1/abilita", json={"abilita": "Richiamo"}, headers=master)
    assert r.status_code == 200, r.text
    c = r.json()["character"]
    assert c["resources"]["mp"] == mp0 - 20
    assert any("Chiama un animale" in line for line in c["combat"]["log"])


def test_hostile_without_target_is_explained(client, master):
    give(client, master, 1, "Dardo", TPL[1])
    r = client.post("/api/characters/1/abilita", json={"abilita": "Dardo"}, headers=master)
    assert r.status_code == 422 and "bersaglio" in r.json()["detail"].lower()


def test_miracle_scales_with_faith_and_favor(client, master):
    """Decisione 19: la potenza del miracolo × (1 + Fede/100) × molt. favore (favore non registrato: ×1)."""
    mech = {"v": 1, "tipo": "miracolo", "tiro_colpire": False, "effetti": [
        {"bersaglio": {"lato": "alleato"}, "azione": {"op": "cura"}, "formula": {"base": "fissa", "min": 100}}]}
    give(client, master, 1, "Luce Sacra", mech, kind="Miracolo", god="Solaria", efficacia=1, favor=1)
    body = {"abilita": "Luce Sacra", "bersaglio": {"tipo": "pg", "id": 1}}
    prev = lambda: client.post("/api/characters/1/abilita/anteprima", json=body, headers=master).json()
    p = prev()
    assert any("Cura: 100 =" in s or "= 100" in s for s in p["passi"]), p["passi"]  # nessuna Fede né favore registrato
    c = client.get("/api/characters/1", headers=master).json()
    stats = c["stats"] + [{"code": "FED", "name": "Fede", "kind": "avanzata", "iniziale": 50}]
    rep = (c.get("reputation") or []) + [{"scope": "Cosmica", "target": "Solaria", "label": "Prescelto", "value": 3}]
    r = client.patch("/api/characters/1", json={"stats": stats, "reputation": rep}, headers=master)
    assert r.status_code == 200, r.text
    p = prev()
    assert any("= 225" in s and "Solaria" in s for s in p["passi"]), p["passi"]  # 100 × 1,5 Fede × 1,5 favore (+2 gradi)
    rep[-1] = {**rep[-1], "label": "Rinnegato", "value": -2}
    client.patch("/api/characters/1", json={"reputation": rep}, headers=master)
    p = prev()
    assert any("= 0" in s for s in p["passi"]), p["passi"]  # due o più gradi sotto: il miracolo non avviene
