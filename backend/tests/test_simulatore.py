"""Simulatore di danno: confronto abilità, bersagli diversi, modificatori; le schede non cambiano."""
from conftest import login

from app.mech_templates import TEMPLATES

TPL = {t["cat"]: t["mech"] for t in TEMPLATES}


def give(client, master, char_id, name, mech=None, **extra):
    c = client.get(f"/api/characters/{char_id}", headers=master).json()
    item = {"name": name, "effect": "", "lvl": 3, "pct": 0, "cost": extra.pop("cost", ""), "cd": 0, **extra}
    if mech:
        item["mech"] = mech
    assert client.patch(f"/api/characters/{char_id}", json={"active_skills": c["active_skills"] + [item]}, headers=master).status_code == 200


def sim(client, master, **body):
    r = client.post("/api/simulatore", json=body, headers=master)
    assert r.status_code == 200, r.text
    return r.json()


def test_compare_abilities_against_spoken_target(client, master):
    give(client, master, 2, "Dardo", TPL[1])
    give(client, master, 2, "Cura", TPL[5])
    give(client, master, 2, "Richiamo", cost="20 MP")
    before = client.get("/api/characters/2", headers=master).json()["resources"]
    out = sim(client, master, attaccante={"tipo": "pg", "id": 2}, bersaglio={"tipo": "voce", "nome": "Wyrm", "hp": 40000})
    rows = {r["abilita"]: r for r in out["risultati"]}
    d = rows["Dardo"]
    assert d["tipo_valore"] == "danno" and 0 < d["min"] <= d["medio"] <= d["max"] * 2 and d["lanci"] >= 1
    assert d["costo_valore"] == 30 and d["per_costo"] > 0
    assert rows["Cura"]["tipo_valore"] == "cura" and rows["Cura"]["medio"] > 0
    assert rows["Richiamo"]["testo"] and "nota" in rows["Richiamo"]
    assert out["bersaglio"]["hp"] == 40000
    assert client.get("/api/characters/2", headers=master).json()["resources"] == before  # niente cambia


def test_resistance_grade_and_bonus_change_numbers(client, master):
    give(client, master, 2, "Dardo", TPL[1])
    base = sim(client, master, attaccante={"tipo": "pg", "id": 2}, bersaglio={"tipo": "voce"}, abilita=["Dardo"])["risultati"][0]
    res = sim(client, master, attaccante={"tipo": "pg", "id": 2}, bersaglio={"tipo": "voce", "resistenza": 50},
              abilita=["Dardo"])["risultati"][0]
    up = sim(client, master, attaccante={"tipo": "pg", "id": 2}, bersaglio={"tipo": "voce"}, abilita=["Dardo"],
             grado=6, bonus_danni=50)["risultati"][0]
    assert res["max"] < base["max"] < up["max"]
    assert up["max"] == base["max"] * 2 * 1.5 or abs(up["max"] - base["max"] * 3) <= 2  # grado 3 → 6, +50%


def test_creature_vs_pg_and_master_only(client, master):
    out = sim(client, master, attaccante={"tipo": "creatura", "nome": "Lupo", "level": 30, "rarity": "Raro"},
              bersaglio={"tipo": "pg", "id": 1})
    att = out["risultati"][0]
    assert att["abilita"] == "Attacco" and att["colpire"] is not None and att["lanci"] >= 1
    p1 = login(client, "giocatore1")
    assert client.post("/api/simulatore", json={"attaccante": {"tipo": "voce"}, "bersaglio": {"tipo": "voce"}},
                       headers=p1).status_code == 403
    opt = client.get("/api/simulatore/opzioni", headers=master).json()
    assert opt["pg"] and "Raro" in opt["rarita"]
