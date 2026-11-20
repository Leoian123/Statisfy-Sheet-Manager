"""Inventario stile MMORPG: slot, due mani, requisiti, colonna Oggetti, bonus alle derivate, endpoint."""
import copy

import pytest

from app import rules
from app.seed import KELVIN

from test_api import kelvin_id


def kelvin(**over):
    c = {k: copy.deepcopy(KELVIN[k]) for k in ("stats", "equip", "magia", "item_bonus", "inventory", "level")}
    c.update(over)
    return c


def item(c, item_id):
    return next(x for x in rules.normalize_inventory(c["inventory"]) if x["id"] == item_id)


def by_key(c):
    return {d["key"]: d for d in rules.derived(rules.apply_equipment(c))}


# ---------- Regole pure ----------

def test_slots_and_types():
    assert len(rules.SLOTS) == 16
    assert rules.EQUIP_TYPES["anello"]["slots"] == ["anello1", "anello2"]
    assert rules.EQUIP_TYPES["unaMano"]["slots"] == ["manoPrincipale", "manoSecondaria"]
    assert rules.EQUIP_TYPES["dueMani"]["two_handed"] is True
    for t in ("scudo", "tenuto"):
        assert rules.EQUIP_TYPES[t]["slots"] == ["manoSecondaria"]
    assert rules.EQUIP_TYPES["manoPrincipale"]["slots"] == ["manoPrincipale"]
    cfg = rules.rules_config()
    assert len(cfg["slots"]) == 16 and cfg["equip_formula_keys"] == ["difesa", "difesaMagica", "blocco"]
    assert cfg["sources"][-1]["key"] == "oggetti"


def test_kelvin_equipped_map():
    inv = rules.normalize_inventory(KELVIN["inventory"])
    assert rules.equipped_map(inv) == {"manoPrincipale": "it-thanatos", "manoSecondaria": "it-thanatos",
                                       "spalle": "it-simbionte"}


def test_stat_bonus_goes_to_oggetti_column():
    res = rules.equip_item(kelvin(), "it-elmo")
    assert res["slot"] == "testa" and res["removed"] == []
    c = rules.apply_equipment(kelvin(inventory=res["inventory"]))
    vit = next(r for r in c["stats"] if r["code"] == "VIT")
    assert vit["oggetti"] == 8 and rules.stat_total(vit) == 194
    aut = next(r for r in c["stats"] if r["code"] == "AUT")
    assert aut["oggetti"] == 5
    # La colonna Oggetti è sempre ricalcolata: un valore inserito a mano viene ignorato
    forged = kelvin(stats=[{**r, "oggetti": 999} for r in KELVIN["stats"]])
    assert rules.totals(rules.apply_equipment(forged)["stats"])["STR"] == 170


def test_defense_stays_in_formula_other_bonus_added_after():
    d = by_key(kelvin())
    # Difesa degli oggetti dentro la formula decisa: VIT/10 + Difesa equip × (1 + VIT/100)
    assert d["difesa"]["explain"] == "186/10 + 85 × (1 + 186/100)"
    assert d["difesa"]["bonus"] == 0 and d["difesa"]["value"] == pytest.approx(261.7)
    # Evasione e critico degli oggetti si sommano dopo la formula
    assert (d["evasione"]["bonus"], d["critico"]["bonus"]) == (10, 12)
    assert d["critico"]["value"] == pytest.approx(5 + 492 / 40 + 12)
    # Elmo: +30 Difesa e +8 VIT → entrambe nella formula
    d = by_key(kelvin(inventory=rules.equip_item(kelvin(), "it-elmo")["inventory"]))
    assert d["difesa"]["explain"] == "194/10 + 115 × (1 + 194/100)"


def test_shield_block_and_two_handed():
    res = rules.equip_item(kelvin(), "it-scudo")
    assert res["slot"] == "manoSecondaria"
    assert res["removed"] == ["La Promessa di Thanatos"]  # l'arma a due mani torna nella borsa
    c = kelvin(inventory=res["inventory"])
    assert rules.equipped_map(rules.normalize_inventory(c["inventory"]))["manoSecondaria"] == "it-scudo"
    d = by_key(c)
    assert d["blocco"]["value"] == pytest.approx(20 + 170 / 40)
    assert d["blocco"]["explain"] == "20 + 170/40"
    assert d["critico"]["bonus"] == 0
    # Rimettere l'arma a due mani libera entrambe le mani
    res = rules.equip_item(c, "it-thanatos")
    assert res["slot"] == "manoPrincipale" and res["removed"] == ["Scudo di pelle di Wyrm"]


def test_dual_wield_and_move():
    c = kelvin()
    res = rules.equip_item(c, "it-pugnale")
    assert res["slot"] == "manoPrincipale" and res["removed"] == ["La Promessa di Thanatos"]
    c = kelvin(inventory=res["inventory"])
    res = rules.equip_item(c, "it-coltello")
    assert res["slot"] == "manoSecondaria" and res["removed"] == []  # doppia impugnatura libera
    c = kelvin(inventory=res["inventory"])
    res = rules.move_item(c, "manoPrincipale", "manoSecondaria")
    assert res["swapped"] == "Coltello d'osso"
    m = rules.equipped_map(res["inventory"])
    assert (m["manoPrincipale"], m["manoSecondaria"]) == ("it-coltello", "it-pugnale")
    # Frusta: solo mano principale
    c = kelvin(inventory=res["inventory"])
    with pytest.raises(rules.EquipError, match="Slot ammessi: Mano principale"):
        rules.equip_item(c, "it-frusta", "manoSecondaria")
    # Lo scudo non va in mano principale; il fischietto (tenuto) sostituisce l'oggetto in secondaria
    with pytest.raises(rules.EquipError):
        rules.equip_item(c, "it-scudo", "manoPrincipale")
    res = rules.equip_item(c, "it-fischietto")
    assert res["slot"] == "manoSecondaria" and res["removed"] == ["Pugnale da scuoiatore"]


def test_rings_fill_both_slots_then_replace():
    c = kelvin()
    res = rules.equip_item(c, "it-anello-wyrm")
    assert res["slot"] == "anello1"
    c = kelvin(inventory=res["inventory"])
    res = rules.equip_item(c, "it-anello-fin")
    assert res["slot"] == "anello2"
    c = kelvin(inventory=res["inventory"])
    with pytest.raises(rules.EquipError, match="due mani"):
        rules.move_item(c, "manoPrincipale", "anello1")
    res = rules.move_item(c, "anello1", "anello2")
    assert res["swapped"] == "Anello dell'Artigiano"


def test_requirements_block_equip():
    c = kelvin(level=50)
    with pytest.raises(rules.EquipError, match=r"requisiti non soddisfatti \(Livello 55\)"):
        rules.equip_item(c, "it-corazza")
    weak = [{**r, "investiti": 0} if r["code"] == "STR" else r for r in KELVIN["stats"]]
    with pytest.raises(rules.EquipError, match="STR 150"):
        rules.equip_item(kelvin(stats=weak), "it-scudo")
    assert rules.unmet_requirements(rules.apply_equipment(kelvin(stats=weak)), item(kelvin(), "it-scudo")) == ["STR 150"]


def test_not_equippable_and_unequip():
    with pytest.raises(rules.EquipError, match="non equipaggiabile"):
        rules.equip_item(kelvin(), "it-razione")
    with pytest.raises(rules.EquipError, match="non trovato"):
        rules.equip_item(kelvin(), "nope")
    # Togliere dalla mano secondaria bloccata toglie l'arma a due mani
    res = rules.unequip_slot(kelvin(), "manoSecondaria")
    assert res["removed"] == ["La Promessa di Thanatos"] and "manoPrincipale" not in rules.equipped_map(res["inventory"])
    with pytest.raises(rules.EquipError, match="vuoto"):
        rules.unequip_slot(kelvin(), "testa")


def test_validate_equipment():
    inv = rules.normalize_inventory(KELVIN["inventory"])
    assert rules.validate_equipment(inv) is None
    bad = copy.deepcopy(inv)
    next(x for x in bad if x["id"] == "it-scudo")["slot"] = "manoSecondaria"  # occupata dalla due mani
    assert "occupato due volte" in rules.validate_equipment(bad)
    bad = copy.deepcopy(inv)
    next(x for x in bad if x["id"] == "it-elmo")["slot"] = "piedi"
    assert "non può stare nello slot Piedi" in rules.validate_equipment(bad)


def test_previews():
    p = rules.item_previews(kelvin())
    assert "it-thanatos" not in p and "it-razione" not in p
    assert p["it-elmo"]["ok"] and p["it-elmo"]["slot"] == "testa"
    assert p["it-elmo"]["stats"] == {"VIT": 8, "AUT": 5}
    assert p["it-elmo"]["derived"]["hp"] == 120
    assert p["it-scudo"]["replaces"] == ["La Promessa di Thanatos"]
    assert p["it-scudo"]["derived"]["critico"] == -12
    low = rules.item_previews(kelvin(level=50))
    assert low["it-corazza"]["ok"] is False and low["it-corazza"]["unmet"] == ["Livello 55"]


def test_legacy_item_normalized():
    it = rules.normalize_item({"name": "Spada", "stats": "Req 15 STR", "rarity": "Comune", "type": "Arma",
                               "qty": 1, "weight": 3})
    assert it["stats"] == {} and it["stats_text"] == "Req 15 STR"
    assert it["equip_type"] is None and it["slot"] is None and it["category"] == "altro"
    assert rules.normalize_item({"name": "Pane", "type": "Cibo"})["category"] == "consumabili"
    assert rules.normalize_item({"name": "Pelle", "type": "Materiale"})["category"] == "materiali"


# ---------- API ----------

def test_api_kelvin_inventory(client, p1):
    kid = kelvin_id(client, p1)
    c = client.get(f"/api/characters/{kid}", headers=p1).json()
    assert c["equipped"]["manoSecondaria"] == "it-thanatos"
    assert c["stats"][0]["oggetti"] == 0
    assert c["item_previews"]["it-elmo"]["ok"] is True
    assert c["item_previews"]["it-scudo"]["derived"]["critico"] == -12  # niente doppio conteggio dei bonus
    d = {x["key"]: x for x in c["derived"]}
    assert d["critico"]["bonus"] == 12 and d["evasione"]["bonus"] == 10
    assert c["item_bonus"] == {} and c["equip"] == {"difesa": 0, "difesaMagica": 0, "blocco": 0}  # solo manuali
    scudo = next(i for i in c["inventory"] if i["id"] == "it-scudo")
    assert scudo["unmet"] == [] and scudo["category"] == "equipaggiamento" and scudo["equip_type"] == "scudo"
    rules_cfg = client.get("/api/rules").json()
    assert len(rules_cfg["slots"]) == 16 and len(rules_cfg["equip_types"]) == 17


def test_api_equip_unequip_move(client, p1):
    kid = kelvin_id(client, p1)
    url = f"/api/characters/{kid}/equipment"
    r = client.post(f"{url}/equip", json={"item_id": "it-elmo"}, headers=p1)
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["equipped"]["testa"] == "it-elmo"
    vit = next(s for s in c["stats"] if s["code"] == "VIT")
    assert vit["oggetti"] == 8 and vit["total"] == 194 and c["totals"]["VIT"] == 194
    r = client.post(f"{url}/equip", json={"item_id": "it-pugnale", "slot": "manoSecondaria"}, headers=p1)
    c = r.json()
    assert c["equipped"].get("manoPrincipale") is None and c["equipped"]["manoSecondaria"] == "it-pugnale"
    r = client.post(f"{url}/move", json={"from_slot": "manoSecondaria", "to_slot": "manoPrincipale"}, headers=p1)
    assert r.status_code == 200 and r.json()["equipped"]["manoPrincipale"] == "it-pugnale"
    r = client.post(f"{url}/unequip", json={"slot": "testa"}, headers=p1)
    assert r.status_code == 200 and "testa" not in r.json()["equipped"]
    # Errori chiari (422)
    r = client.post(f"{url}/equip", json={"item_id": "it-scudo", "slot": "testa"}, headers=p1)
    assert r.status_code == 422 and "Slot ammessi: Mano secondaria" in r.json()["detail"]
    r = client.post(f"{url}/equip", json={"item_id": "it-razione"}, headers=p1)
    assert r.status_code == 422 and "non equipaggiabile" in r.json()["detail"]
    r = client.post(f"{url}/unequip", json={"slot": "collo"}, headers=p1)
    assert r.status_code == 422
    r = client.post(f"{url}/unequip", json={"slot": "coda"}, headers=p1)
    assert r.status_code == 422 and "slot" in r.json()["detail"]


def test_api_requirements_and_permissions(client, master, p1, p2):
    kid = kelvin_id(client, master)
    url = f"/api/characters/{kid}/equipment"
    c = client.get(f"/api/characters/{kid}", headers=master).json()
    inv = c["inventory"] + [{"id": "it-ascia", "name": "Ascia del Titano", "rarity": "Leggendario", "type": "Arma",
                             "equip_type": "dueMani", "req": {"level": 120, "STR": 400}, "weight": 12, "qty": 1}]
    r = client.patch(f"/api/characters/{kid}", json={"inventory": inv}, headers=master)
    assert r.status_code == 200, r.text
    ascia = next(i for i in r.json()["inventory"] if i["id"] == "it-ascia")
    assert ascia["unmet"] == ["Livello 120", "STR 400"]
    r = client.post(f"{url}/equip", json={"item_id": "it-ascia"}, headers=p1)
    assert r.status_code == 422
    assert r.json()["detail"] == ("Impossibile equipaggiare Ascia del Titano: requisiti non soddisfatti "
                                  "(Livello 120, STR 400).")
    # Il Master equipaggia su tutti i PG, un altro giocatore no
    assert client.post(f"{url}/equip", json={"item_id": "it-elmo"}, headers=master).status_code == 200
    assert client.post(f"{url}/equip", json={"item_id": "it-elmo"}, headers=p2).status_code == 404
    # Il giocatore non può riscrivere l'inventario a mano
    assert client.patch(f"/api/characters/{kid}", json={"inventory": inv}, headers=p1).status_code == 403


def test_api_patch_rejects_invalid_slots(client, master):
    kid = kelvin_id(client, master)
    inv = client.get(f"/api/characters/{kid}", headers=master).json()["inventory"]
    next(i for i in inv if i["id"] == "it-scudo")["slot"] = "manoSecondaria"
    r = client.patch(f"/api/characters/{kid}", json={"inventory": inv}, headers=master)
    assert r.status_code == 422 and "occupato due volte" in r.json()["detail"]


def test_api_resources_clamped_after_unequip(client, p1):
    kid = kelvin_id(client, p1)
    url = f"/api/characters/{kid}/equipment"
    c = client.post(f"{url}/equip", json={"item_id": "it-elmo"}, headers=p1).json()
    hp_max = next(d for d in c["derived"] if d["key"] == "hp")["value"]
    assert hp_max == 3010
    client.patch(f"/api/characters/{kid}", json={"resources": {**c["resources"], "hp": hp_max}}, headers=p1)
    c = client.post(f"{url}/unequip", json={"slot": "testa"}, headers=p1).json()
    assert c["resources"]["hp"] == 2890


def test_preview_with_inventory(client, p1):
    kid = kelvin_id(client, p1)
    c = client.get(f"/api/characters/{kid}", headers=p1).json()
    body = {"stats": c["stats"], "item_bonus": c["item_bonus"], "equip": c["equip"], "magia": c["magia"],
            "inventory": c["inventory"]}
    d = {x["key"]: x for x in client.post("/api/rules/preview", headers=p1, json=body).json()["derived"]}
    assert d["critico"]["bonus"] == 12 and d["difesa"]["explain"] == "186/10 + 85 × (1 + 186/100)"


def test_migrate_legacy_inventory(client):
    from app.db import SessionLocal
    from app.models import Character
    from app.seed import migrate
    with SessionLocal() as db:
        c = db.query(Character).filter(Character.name == "Eric").one()
        c.inventory = [{"name": "Spada", "stats": "Req 15 STR", "rarity": "Comune", "type": "Arma", "qty": 1, "weight": 3}]
        db.commit()
        assert migrate(db) == 1
        db.refresh(c)
        it = c.inventory[0]
        assert it["id"].startswith("it-") and it["stats"] == {} and it["stats_text"] == "Req 15 STR"
        assert migrate(db) == 0
