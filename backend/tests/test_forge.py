"""Forgia del Master: regole (rules.py), wizard (forge.py) e API /api/forge."""
import random

import pytest

from app import forge, rules
from test_api import kelvin_id


# ---------------- Regole pure ----------------
def test_exp_rarity_is_grade_cubed():
    one = rules.exp_for(10, [{"name": "Lupo", "level": 10, "rarity": "Comune", "count": 1}])
    rare = rules.exp_for(10, [{"name": "Lupo", "level": 10, "rarity": "Raro", "count": 1}])
    # pari livello 2%, dal livello 10 metà → 1%; Raro ×27
    assert one["pct"] == 1 and rare["pct"] == 27
    assert rules.exp_for(5, [{"name": "Drago", "level": 20, "rarity": "Divino", "count": 2}])["pct"] == 10 * 512 * 2
    assert rules.exp_gain(60, 50)["pct"] == 0  # 10 livelli sotto: 0%
    assert rules.exp_gain(1, 3) == {"base": 4, "factor": 1, "pct": 4}


def test_gain_exp_and_share():
    assert rules.gain_exp(10, 50, 30) == {"level": 10, "exp_pct": 80, "ups": 0}
    assert rules.gain_exp(10, 50, 275.5) == {"level": 13, "exp_pct": 25.5, "ups": 3}
    assert rules.exp_share({1: 30, 2: 60}, "intera") == {1: 30, 2: 60}
    assert rules.exp_share({1: 30, 2: 60}, "divisa") == {1: 15, 2: 30}


def test_creature_formulas():
    k = rules.creature(10, "Raro", "Robusta")
    assert k["dmg"] == (10 + 60) * 27 and k["hp"] == (40 + 200) * 27 * 1.5


def test_difficulty_bands():
    weak = [{"hp": 1000, "dmg": 100}]
    d = rules.difficulty([{"level": 1, "rarity": "Comune", "size": "Normale", "count": 1}], weak)
    assert d["label"] == "Banale"
    d = rules.difficulty([{"level": 100, "rarity": "Divino", "size": "Normale", "count": 1}], weak)
    assert d["label"] == "Impossibile"


def test_skill_grades():
    assert rules.linear_grades(2) == [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
    rows = [{"what": "Precisione", "unit": "%", "vals": rules.linear_grades(2)}, {"what": "Peso", "unit": "punti", "vals": [1] * 10}]
    assert rules.grade_text(rows, 3) == "+6% Precisione, +1 punti Peso"


def test_spell_rules():
    assert [rules.spell_cost(l) for l in (1, 3, 5, 10)] == [20, 120, 300, 1100]
    assert [rules.cast_turns(l) for l in (1, 3, 4, 10)] == [1, 1, 2, 4]
    assert [rules.spell_cd(l) for l in (1, 2, 3, 10)] == [1, 1, 2, 5]
    # Anima → Vis pericolosa, Vis → Anima neutra: vale la più severa
    p = rules.pair_compat("Vis", "Anima")
    assert p["level"] == "D" and p["disagree"]
    L = rules.spell_levels([{"s": "Ignis", "trav": True}, {"s": "Ventus"}], 3, ["empower", "sph:Ignis"], "vulcano", 2)
    assert (L["cast"], L["eff"], L["zone"]) == (3 + 2 + 2 + 1, 3 + 2 + 2, 2)
    b = rules.backlash([{"s": "Tempus"}, {"s": "Ignis"}], 4, {"fatigue": True, "protections": 1}, False, True)
    # 8 + fatica 1 + overcast 2 − protezioni 1 + sfera pura 2 + coppia pericolosa 2 = 14
    assert b["score"] == 14 and b["band"] == "Moderato"


def test_miracle_rules():
    assert [rules.miracle_cost(l) for l in (1, 3, 5)] == [25, 150, 375]
    assert [rules.miracle_fede(l) for l in (1, 3, 10)] == [10, 60, 550]
    assert rules.favor_required(1, True) == 1 and rules.favor_required(9, True) == 4 and rules.favor_required(4, False) == 3
    assert rules.favor_mult(3, 1)["mult"] == 1.5 and rules.favor_mult(0, 1)["mult"] == 0.5 and rules.favor_mult(-1, 1)["mult"] == 0


def test_title_evolution_replaces_previous():
    stats = [{"code": "STR", "titoli": 10}, {"code": "VIT", "titoli": 10}]
    titles = [{"name": "Ammazzadraghi", "rarity": "Raro", "bonus": {"STR": 10, "VIT": 10}}]
    res = rules.assign_title(stats, titles, {"name": "Flagello dei Draghi", "rarity": "Epico", "bonus": {"STR": 20, "AUT": 5}}, "Ammazzadraghi")
    assert res == {"missing": ["AUT"], "replaced": "Ammazzadraghi"}
    assert [t["name"] for t in titles] == ["Flagello dei Draghi"]
    assert stats == [{"code": "STR", "titoli": 20}, {"code": "VIT", "titoli": 0}]
    assert rules.expand_title_bonus([{"code": "ALL", "val": 5}, {"code": "STR", "val": 2}]) == {"STR": 7, "DEX": 5, "VIT": 5, "INT": 5}


def test_drop_profile_is_a_d100_table():
    cs = [{"name": "Lupo", "level": 10, "rarity": "Raro", "count": 8}]
    pf = rules.make_drop_profile(cs, random.Random(1), "Normale")
    assert pf["kind"] == "Normale" and pf["top"] == "Raro" and pf["rolls"] == 6
    assert [r["from"] for r in pf["rows"]] == [1, 6, 31, 71] and pf["rows"][-1]["to"] == 100
    assert [r["rarity"] for r in pf["rows"]] == ["Epico", "Raro", "Non Comune", ""]
    out = rules.roll_drop(pf, random.Random(2))
    assert len(out["rolls"]) == 6 and "Materiali di lupo" in out["text"]
    assert rules.roll_drop(pf, random.Random(2)) == out  # stesso seme, stesso tiro


# ---------------- API ----------------
def preview(client, h, kind, draft):
    r = client.post("/api/forge/preview", json={"kind": kind, "draft": draft}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def save(client, h, kind, draft):
    return client.post("/api/forge/entries", json={"kind": kind, "draft": draft}, headers=h)


def char(client, h, cid):
    return client.get(f"/api/characters/{cid}", headers=h).json()


SKILL = {"name": "Lancia del Gelo", "type": "Combat", "mode": "attiva", "res": "SP", "cost": 15, "cd": 3,
         "effect": "Affondo che rallenta il bersaglio", "rows": rules.WEAPON_GRADE_ROWS, "costRed": 1,
         "passiveX": "Ogni colpo congela per un turno", "school": False, "schoolName": "", "grade1": "Al primo uso vero.",
         "method": "Level up"}


def test_forge_is_master_only(client, p1):
    assert client.get("/api/forge/meta", headers=p1).status_code == 403
    assert client.post("/api/forge/preview", json={"kind": "skills", "draft": {}}, headers=p1).status_code == 403


def test_skill_wizard_saves_and_assigns(client, master):
    kid = kelvin_id(client, master)
    pv = preview(client, master, "skills", {**SKILL, "name": "x"})
    assert pv["first_bad"] == 0 and pv["steps"][0].startswith("Dai un nome")
    pv = preview(client, master, "skills", {**SKILL, "charId": kid})
    assert pv["first_bad"] == -1 and pv["computed"]["weapon_rule"] and pv["computed"]["grades"][9] == "+20% Precisione, +10% Danno"
    r = save(client, master, "skills", {**SKILL, "charId": kid})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["entry"]["assigned_to"] == kid and body["entry"]["assigned_name"] == "Kelvin"
    act = char(client, master, kid)["active_skills"]
    assert act[-1]["name"] == "Lancia del Gelo" and act[-1]["cost"] == "15 SP" and act[-1]["lvl"] == 1
    # stesso nome: rifiutata; un valore di Grado mancante: rifiutata
    assert save(client, master, "skills", SKILL).status_code == 422
    bad = {**SKILL, "name": "Altra", "rows": [{"what": "Danno", "unit": "%", "vals": [1, 2, ""]}]}
    r = save(client, master, "skills", bad)
    assert r.status_code == 422 and "Grado III" in r.json()["detail"]
    lib = client.get("/api/forge/library", headers=master).json()
    assert [e["name"] for e in lib] == ["Lancia del Gelo"]


def test_title_evolution_on_character(client, master):
    kid = kelvin_id(client, master)
    before = char(client, master, kid)
    dex = before["totals"]["DEX"]
    draft = {"name": "Maestro Artigiano", "rarity": "Epico", "how": "Completare cento opere", "bonus": [{"code": "DEX", "val": 20}],
             "effType": "nessuno", "trigger": "Consegnare la centesima opera", "prev": "Artigiano Talentuoso", "next": "",
             "charId": kid}
    pv = preview(client, master, "titles", draft)
    assert pv["first_bad"] == -1 and pv["computed"]["assign"]["replaces"] == "Artigiano Talentuoso"
    r = save(client, master, "titles", draft)
    assert r.status_code == 201, r.text
    after = char(client, master, kid)
    names = [t["name"] for t in after["titles"]]
    assert "Artigiano Talentuoso" not in names and "Maestro Artigiano" in names
    # Artigiano Talentuoso dava DEX +5: tolto, poi +20
    assert after["totals"]["DEX"] == dex - 5 + 20
    # stesso PG, titolo incompatibile
    clash = {**draft, "name": "Rinnegato", "prev": "", "incompat": ["Maestro Artigiano"]}
    assert preview(client, master, "titles", clash)["steps"][4].startswith("Kelvin ha «Maestro Artigiano»")


def test_race_npc_class_entries(client, master):
    race = {"name": "Nani delle Montagne", "origin": "Montagne", "desc": "Artigiani della forgia, resistenza leggendaria.",
            "traits": [{"name": "Pelle di pietra", "effect": "Difesa +5 contro i colpi contundenti"}],
            "mods": [{"code": "VIT", "val": 30}, {"code": "DEX", "val": -5}, {"code": "LCK", "val": 3}],
            "langs": "Comune, Nanico", "life": 300, "rel": [{"race": "Umani", "rel": "Alleati"}]}
    pv = preview(client, master, "races", race)
    assert pv["first_bad"] == -1
    hp = next(x for x in pv["computed"]["level1"] if x["key"] == "hp")
    assert hp["value"] == 100 + 40 * 15 and hp["human"] == 100 + 10 * 15
    assert save(client, master, "races", race).status_code == 201
    npc = {"ruolo": "cittadino", "eta": "anziano", "razza": "umano", "zona": "alba-chiara", "seme": 4,
           "ritocchi": ["livello 45", "ex cortigiana"], "nome": "Elena la Saggia",
           "campi": {"contraddizione": "aiuta i forestieri, ma non si fida di nessuno"},
           "storia": {"origine": "Nata ad Alba Chiara"}, "knows": "Niente"}
    r = save(client, master, "npcs", npc)
    assert r.status_code == 201, r.text
    assert r.json()["entry"]["npc_id"] and r.json()["entry"]["data"]["npc"]["livello"] == 45
    assert any(n["name"] == "Elena la Saggia" for n in client.get("/api/npcs", headers=master).json())
    cls = {"name": "Paladino", "ctype": "avanzata", "focus": "Combattente sacro", "unlock": "Addestramento al Tempio di Luxor",
           "keyStats": ["STR", "VIT"], "abMode": "new", "ab": {"name": "Giuramento", "res": "SP", "cost": 20, "cd": 3, "effect": "+30% difesa"},
           "equip": [{"name": "Spada lunga", "note": ""}]}
    assert save(client, master, "classes", cls).status_code == 201
    assert save(client, master, "classes", {**cls, "name": "Guerriero"}).status_code == 422  # classe base già esistente
    meta = client.get("/api/forge/meta", headers=master).json()
    assert "Paladino" in meta["classes"] and meta["races"] == ["Nani delle Montagne"]


def encounter_draft(party):
    return {"name": "Imboscata al guado", "place": "Guado del Salice", "env": "Foresta", "party": party, "level": 100,
            "creatures": [{"name": "Lupo grigio", "level": 110, "rarity": "Leggendario", "size": "Normale", "count": 2}]}


def test_encounter_close_full_and_split(client, master):
    chars = client.get("/api/forge/meta", headers=master).json()["characters"]
    by = {c["name"]: c for c in chars}
    party = [by["Eric"]["id"], by["Deniel"]["id"]]  # entrambi livello 110
    d = encounter_draft(party)
    pv = preview(client, master, "encounters", d)
    assert pv["first_bad"] == -1
    # lv 110 contro lv 110: 2% × 1/4 = 0,5% × 216 (Leggendario) × 2 lupi = 216%
    assert {x["pct"] for x in pv["computed"]["exp_by_pc"]} == {216}
    assert pv["computed"]["difficulty"]["label"] in rules.DIFFICULTY_LABELS
    r = save(client, master, "encounters", d)
    assert r.status_code == 201, r.text
    eid = r.json()["entry"]["id"]
    rows = client.get(f"/api/forge/encounters/{eid}/exp?mode=divisa", headers=master).json()["rows"]
    assert {x["pct"] for x in rows} == {108} and all(x["ups"] == 1 for x in rows)
    eric_before = char(client, master, by["Eric"]["id"])
    r = client.post(f"/api/forge/encounters/{eid}/close", json={"mode": "intera"}, headers=master)
    assert r.status_code == 200, r.text
    assert r.json()["entry"]["closed"]["mode"] == "intera"
    eric = char(client, master, by["Eric"]["id"])
    assert eric["level"] == 112 and eric["exp_pct"] == 16
    assert eric["totals"]["STR"] == eric_before["totals"]["STR"] + 2
    assert eric["free_points"]["total"] == eric_before["free_points"]["total"] + 20
    assert client.post(f"/api/forge/encounters/{eid}/close", json={"mode": "intera"}, headers=master).status_code == 409


def test_drop_profile_endpoints(client, master):
    cs = encounter_draft([])["creatures"]
    pf = client.post("/api/forge/drop-profile", json={"creatures": cs, "seed": 7}, headers=master).json()
    assert pf["top"] == "Leggendario" and pf["rows"][0]["rarity"] == "Mitico" and pf["rolls"] == 2
    roll = client.post("/api/forge/drop-roll", json={"profile": pf, "seed": 3}, headers=master).json()
    assert len(roll["rolls"]) == 2 and roll["text"]
    assert client.post("/api/forge/drop-profile", json={"creatures": [{"name": ""}]}, headers=master).status_code == 422
    assert client.post("/api/forge/drop-roll", json={"profile": {}}, headers=master).status_code == 422


def test_spell_and_miracle_assignment(client, master):
    kid = kelvin_id(client, master)
    spell = {"name": "Dardo di Forza", "effect": "Un proiettile di energia pura", "origin": "grimorio", "mech": {"v": 1, "effetti": [{"azione": {"op": "danno"}, "formula": {"base": "incantesimo", "tipo": "Vis"}}]},
             "spheres": [{"s": "Vis", "role": "forma", "trav": False}], "combo": False, "level": 1, "meta": [],
             "env": {"zone": "", "ley": 0, "anti": False}, "risk": {"overcast": "auto", "protections": 0},
             "cost": None, "cd": None, "charId": kid, "assign": True, "force": False}
    pv = preview(client, master, "spells", spell)
    c = pv["computed"]
    assert pv["first_bad"] == -1 and c["cost"] == 20 and c["turns"] == 1 and c["reqs"][0]["status"] == "ok"
    assert c["backlash"]["score"] == 2 and "effect" not in c
    # la meccanica è obbligatoria (passo 2) e l'anteprima la mostra con il costo e la ricarica del wizard
    assert "20 MP" in c["mech"]["text"] and "15–30" in c["mech"]["text"]
    nomech = preview(client, master, "spells", {**spell, "mech": None})
    assert nomech["first_bad"] == 1 and "meccanica" in nomech["steps"][1]
    empty = preview(client, master, "spells", {**spell, "mech": {"v": 1, "effetti": []}})
    assert empty["first_bad"] == 1
    # Ignis non è posseduta da Kelvin: serve forzare
    two = {**spell, "name": "Fiamma di Forza", "spheres": [*spell["spheres"], {"s": "Ignis", "role": "sostanza", "trav": False}]}
    assert "non possiede Ignis" in preview(client, master, "spells", two)["steps"][-1]
    assert save(client, master, "spells", spell).status_code == 201
    sk = char(client, master, kid)["active_skills"][-1]
    assert sk["cost"] == "20 MP" and "category" not in sk and {k: sk["mech"]["costi"][0][k] for k in ("risorsa", "valore", "per")} == {"risorsa": "MP", "valore": 20, "per": "lancio"}
    lib = next(e for e in client.get("/api/forge/library", headers=master).json() if e["name"] == "Dardo di Forza")
    assert "Danno" in lib["summary"] and "category" not in lib["data"]

    miracle = {"god": "luxor", "name": "Luce che Risana", "nature": "guarigione", "effect": "Chiude le ferite di un alleato",
               "level": 1, "fede": None, "favor": None, "cost": None, "cd": None, "vows": ["Non mentire sotto giuramento"],
               "customVows": "", "against": "indebolito", "againstNote": "", "charId": kid, "assign": True, "force": False,
               "mech": {"v": 1, "effetti": [{"bersaglio": {"lato": "alleato", "forma": "singolo"}, "azione": {"op": "cura"},
                                             "formula": {"base": "incantesimo", "tipo": "magico"}}]}}
    assert preview(client, master, "miracles", {**miracle, "mech": None})["first_bad"] == 2
    pv = preview(client, master, "miracles", miracle)
    assert "value" not in pv["computed"]["power"] and "25 MP" in pv["computed"]["mech"]["text"]
    assert pv["computed"]["cost"] == 25 and pv["computed"]["fede"] == 10
    # guarigione fuori dal dominio di Luxor: favore richiesto +1 grado (Favorito)
    assert pv["computed"]["sugg_favor_name"] == "Favorito"
    assert "non è un chierico" in pv["steps"][-1]
    r = save(client, master, "miracles", {**miracle, "force": True})
    assert r.status_code == 201 and r.json()["entry"]["data"]["forced"] is True
    assert char(client, master, kid)["active_skills"][-1]["kind"] == "Miracolo"


def test_library_delete(client, master):
    r = save(client, master, "skills", SKILL)
    eid = r.json()["entry"]["id"]
    assert client.delete(f"/api/forge/entries/{eid}", headers=master).status_code == 204
    assert client.get("/api/forge/library", headers=master).json() == []
    assert client.delete(f"/api/forge/entries/{eid}", headers=master).status_code == 404


@pytest.mark.parametrize("kind", forge.KINDS)
def test_empty_drafts_never_crash(client, master, kind):
    pv = preview(client, master, kind, {})
    assert len(pv["steps"]) == len(forge.WIZARDS[kind]["steps"]) and pv["first_bad"] in range(len(pv["steps"]))
    assert save(client, master, kind, {}).status_code == 422


# ---------------- Plancia di comando: oggetti, assegnazione dalla libreria, incontro in corso ----------------
ITEM = {"name": "Lama del Gelo", "rarity": "Epico", "type": "Arma", "equip_type": "unaMano", "weapon_base": 180,
        "stats": [{"code": "STR", "val": 12}], "bonus": [{"key": "critico", "val": 3}], "reqLevel": 70,
        "req": [{"code": "DEX", "val": 100}], "weight": 3, "qty": 1}


def test_item_wizard_puts_item_in_bag(client, master):
    kid = kelvin_id(client, master)
    pv = preview(client, master, "items", {**ITEM, "charId": kid})
    assert pv["first_bad"] == -1
    c = pv["computed"]
    assert c["slots"] == ["Mano principale", "Mano secondaria"] and c["unmet"] == []
    assert c["item"]["stats_text"] == "Una mano · Base 180 · STR +12 · Prob. critico +3"
    assert "Livello 70" not in c["unmet"]
    r = save(client, master, "items", {**ITEM, "charId": kid})
    assert r.status_code == 201, r.text
    inv = char(client, master, kid)["inventory"]
    it = next(x for x in inv if x["name"] == "Lama del Gelo")
    assert it["id"] and it["slot"] is None and it["req"] == {"level": 70, "DEX": 100} and it["bonus"] == {"critico": 3}
    bad = {**ITEM, "bonus": [{"key": "volare", "val": 1}]}
    assert preview(client, master, "items", bad)["first_bad"] == 1


def test_assign_from_library_later(client, master):
    kid = kelvin_id(client, master)
    title = {"name": "Maestro Artigiano", "rarity": "Raro", "how": "Completare cento opere", "bonus": [{"code": "DEX", "val": 20}],
             "effType": "nessuno", "trigger": "Consegnare la centesima opera", "prev": "Artigiano Talentuoso"}
    eid = save(client, master, "titles", title).json()["entry"]["id"]
    pv = client.get(f"/api/forge/entries/{eid}/assign-preview?char_id={kid}", headers=master).json()
    assert pv["error"] == "" and pv["replaces"] == "Artigiano Talentuoso"
    assert {x["code"]: x["delta"] for x in pv["lines"]} == {"DEX": 15, "VIT": -5, "FIN": -10}
    dex = char(client, master, kid)["totals"]["DEX"]
    r = client.post(f"/api/forge/entries/{eid}/assign", json={"char_id": kid}, headers=master)
    assert r.status_code == 200, r.text
    assert r.json()["entry"]["data"]["assignments"][0]["name"] == "Kelvin"
    after = char(client, master, kid)
    assert after["totals"]["DEX"] == dex + 15 and "Artigiano Talentuoso" not in [t["name"] for t in after["titles"]]
    again = client.post(f"/api/forge/entries/{eid}/assign", json={"char_id": kid}, headers=master)
    assert again.status_code == 422 and "ha già il titolo" in again.json()["detail"]
    # incantesimo con sfere che il PG non ha: serve force
    spell = {"name": "Fiamma", "effect": "Una fiammata improvvisa", "origin": "grimorio", "mech": {"v": 1, "effetti": [{"azione": {"op": "danno"}, "formula": {"base": "incantesimo", "tipo": "Vis"}}]},
             "spheres": [{"s": "Ignis", "role": "forma"}], "level": 1, "meta": [], "env": {}, "risk": {}, "assign": False}
    sid = save(client, master, "spells", spell).json()["entry"]["id"]
    r = client.post(f"/api/forge/entries/{sid}/assign", json={"char_id": kid}, headers=master)
    assert r.status_code == 422 and "Ignis" in r.json()["detail"]
    assert client.post(f"/api/forge/entries/{sid}/assign", json={"char_id": kid, "force": True}, headers=master).status_code == 200
    race = save(client, master, "races", {"name": "Drow", "origin": "Profondità", "desc": "Elfi corrotti dall'oscurità.",
                                          "traits": [{"name": "Scurovisione", "effect": "Vede al buio"}], "mods": [],
                                          "langs": "Comune", "life": 300}).json()["entry"]["id"]
    assert client.post(f"/api/forge/entries/{race}/assign", json={"char_id": kid}, headers=master).status_code == 422


def test_live_encounter_and_board(client, master):
    chars = client.get("/api/forge/meta", headers=master).json()["characters"]
    eid = save(client, master, "encounters", encounter_draft([chars[0]["id"]])).json()["entry"]["id"]
    live = lambda body: client.post(f"/api/forge/encounters/{eid}/live", json=body, headers=master)
    assert live({"action": "next_turn"}).status_code == 409  # non ancora in corso
    assert live({"action": "start"}).status_code == 200
    mx = (40 + 110 * 20) * 216 * 2
    r = live({"action": "damage", "index": 0, "amount": 1000})
    assert r.json()["entry"]["data"]["live"]["hp"] == [mx - 1000]
    live({"action": "next_turn"})
    live({"action": "damage", "index": 0, "amount": 10 ** 9})
    assert live({"action": "heal", "index": 0, "amount": 500}).json()["entry"]["data"]["live"]["hp"] == [500]
    b = client.get("/api/forge/board", headers=master).json()
    assert b["active_encounter_id"] == eid and b["campaign"]["session"] >= 1
    enc = b["encounters"][0]
    assert enc["live"]["turn"] == 2 and enc["creatures"][0]["hp"] == 500 and enc["creatures"][0]["max"] == mx
    assert len(b["party"]) == len(chars) and {"hp", "mp", "sp"} <= set(b["party"][0]["maxes"])
    assert any("turno 2" in x["text"] for x in b["log"])
    client.post(f"/api/forge/encounters/{eid}/close", json={"mode": "intera"}, headers=master)
    b = client.get("/api/forge/board", headers=master).json()
    assert b["encounters"] == [] and b["active_encounter_id"] is None


def test_encounter_summary_singular_plural(client, master):
    chars = client.get("/api/forge/meta", headers=master).json()["characters"]
    d = encounter_draft([chars[0]["id"]])
    r = save(client, master, "encounters", d)
    assert r.status_code == 201, r.text
    assert " · 2 creature · " in r.json()["entry"]["summary"]
    d["creatures"][0]["count"] = 1
    r = save(client, master, "encounters", {**d, "name": "Lupo solitario"})
    assert r.status_code == 201, r.text
    assert " · 1 creatura · " in r.json()["entry"]["summary"]
