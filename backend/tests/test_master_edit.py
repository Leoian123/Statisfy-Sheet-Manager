"""Modifica completa della scheda da parte del Master (PATCH /api/characters/{id})."""
from test_api import kelvin_id


def get(client, h, kid):
    return client.get(f"/api/characters/{kid}", headers=h).json()


def patch(client, h, kid, body):
    return client.patch(f"/api/characters/{kid}", json=body, headers=h)


def test_master_edits_level_exp_header(client, master):
    kid = kelvin_id(client, master)
    r = patch(client, master, kid, {"level": 100, "exp_pct": 42.5, "regno": "Qadesh", "pvp": "Rosso",
                                     "gilda": {"nome": "Lanterne", "ruolo": "Capo"}, "corone": 7, "scellini": 3})
    assert r.status_code == 200, r.text
    c = r.json()
    assert (c["level"], c["exp_pct"], c["regno"], c["pvp"], c["corone"]) == (100, 42.5, "Qadesh", "Rosso", 7)
    assert c["free_points"]["total"] == 990 and c["power_rank"] == "Guerriero Scelto"
    assert patch(client, master, kid, {"level": 0}).status_code == 422
    assert patch(client, master, kid, {"exp_pct": 101}).status_code == 422


def test_master_edits_stats(client, master):
    kid = kelvin_id(client, master)
    stats = get(client, master, kid)["stats"]
    vit = next(r for r in stats if r["code"] == "VIT")
    vit["altro"] = 100  # VIT 186 → 286
    stats.append({"code": "FED", "name": "Fede", "kind": "avanzata", "iniziale": 5, "creazione": 0, "investiti": 0,
                  "levelup": 0, "altro": 0, "titoli": 0, "note": "  "})
    r = patch(client, master, kid, {"stats": stats})
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["totals"]["VIT"] == 286 and c["totals"]["FED"] == 5
    assert next(x for x in c["stats"] if x["code"] == "FED")["note"] is None
    assert next(d for d in c["derived"] if d["key"] == "hp")["value"] == 100 + 286 * 15
    # `total` inviato dal client viene ignorato e ricalcolato
    stats[0]["total"] = 1
    assert patch(client, master, kid, {"stats": stats}).json()["stats"][0]["total"] == 170


def test_stats_rules(client, master):
    kid = kelvin_id(client, master)
    stats = get(client, master, kid)["stats"]
    no_str = [r for r in stats if r["code"] != "STR"]
    r = patch(client, master, kid, {"stats": no_str})
    assert r.status_code == 422 and "STR" in r.json()["detail"]
    dup = stats + [dict(stats[4])]
    assert "duplicate" in patch(client, master, kid, {"stats": dup}).json()["detail"]
    bad_kind = [dict(r, kind="base") if r["code"] == "FIN" else r for r in stats]
    assert patch(client, master, kid, {"stats": bad_kind}).status_code == 422
    bad_code = stats + [{"code": "fe d", "name": "x"}]
    assert patch(client, master, kid, {"stats": bad_code}).status_code == 422
    # «Oggetti» è calcolata: non si scrive
    with_items = [dict(r, oggetti=5) if r["code"] == "DEX" else r for r in stats]
    r = patch(client, master, kid, {"stats": with_items})
    assert r.status_code == 422 and "Oggetti" in r.json()["detail"]


def test_stats_lower_max_clamps_resources(client, master):
    kid = kelvin_id(client, master)
    stats = get(client, master, kid)["stats"]
    for r in stats:
        if r["code"] == "VIT":
            r["investiti"] = 0  # VIT 186 → 111, HP max 1765
    c = patch(client, master, kid, {"stats": stats}).json()
    assert c["resources"]["hp"] == 1765
    r = patch(client, master, kid, {"resources": {"hp": 1766, "mp": 0, "sp": 0}})
    assert r.status_code == 422 and "HP oltre il massimo" in r.json()["detail"]
    assert patch(client, master, kid, {"resources": {"hp": 1765, "mp": 10, "sp": 0}}).status_code == 200


def test_master_edits_lists(client, master):
    kid = kelvin_id(client, master)
    body = {
        "titles": [{"name": "Nuovo", "rarity": "Mitico", "bonus": {"FIN": 3}}],
        "skills": [{"name": "Cooking", "lvl": 10, "pct": "MAX", "type": "Craft"}, {"name": "Nuoto", "lvl": 1, "pct": 5}],
        "active_skills": [{"name": "Urlo", "effect": "Spaventa", "lvl": 2, "pct": 50, "cost": "10 SP", "cd": 2}],
        "talents": [{"name": "Gatherer", "rarity": "Comune", "origin": "Lvl 10", "effect": "+20%"}],
        "inventory": [{"name": "Elmo", "rarity": "Raro", "type": "Armatura", "equip_type": "elmo", "stats": {"VIT": 8},
                       "qty": 1, "weight": 3, "slot": "testa", "id": "it-elmo"}],
        "pets": [{"name": "Celsius", "species": "Topo", "lvl": 57, "passive": "Gelo",
                  "skills": [{"name": "Morso", "lvl": 7, "pct": 0}]}],
        "curses": [{"name": "Braccio", "desc": "d", "bonus": "b", "malus": "m"}],
        "quests": [{"name": "Wyrm", "progress": "3/3", "reward": "Uovo", "rarity": ""}],
        "reputation": [{"scope": "PNG", "target": "Marta", "value": -4, "range": 10, "label": "Sospetto"}],
    }
    r = patch(client, master, kid, body)
    assert r.status_code == 200, r.text
    c = r.json()
    for k, v in body.items():
        if k == "inventory":  # l'inventario torna normalizzato (campi di default aggiunti): confronto sui campi inviati
            assert [{f: it[f] for f in sent} for it, sent in zip(c[k], v)] == v, k
        else:
            assert c[k] == v, k
    # campi dell'oggetto (slot, id) conservati
    assert get(client, master, kid)["inventory"][0]["slot"] == "testa"


def test_list_rules(client, master):
    kid = kelvin_id(client, master)
    cases = [
        {"titles": [{"name": "X", "rarity": "Leggendaria", "bonus": {}}]},
        {"titles": [{"name": "X", "rarity": "Raro", "bonus": {"XYZ": 1}}]},
        {"skills": [{"name": "X", "lvl": 11, "pct": 0}]},
        {"skills": [{"name": "X", "lvl": 1, "pct": 120}]},
        {"skills": [{"name": "", "lvl": 1, "pct": 0}]},
        {"active_skills": [{"name": "X", "lvl": 0}]},
        {"active_skills": [{"name": "X", "lvl": 1, "cd": -1}]},
        {"talents": [{"name": "X", "rarity": ""}]},
        {"inventory": [{"name": "X", "rarity": "Raro", "qty": -1}]},
        {"inventory": [{"name": "X", "rarity": "Raro", "stats": {"ABC": 2}}]},
        {"pets": [{"name": "X", "lvl": 1, "skills": [{"name": "Y", "lvl": 12, "pct": 0}]}]},
        {"quests": [{"name": "X", "rarity": "Rarissimo"}]},
        {"reputation": [{"target": "X", "value": 11, "range": 10}]},
        {"reputation": [{"target": "X", "value": 1, "range": -1}]},
    ]
    for body in cases:
        r = patch(client, master, kid, body)
        assert r.status_code == 422, (body, r.text)
        assert isinstance(r.json()["detail"], str)
    # nessuna modifica parziale salvata
    assert get(client, master, kid)["titles"][0]["name"] == "Artigiano Talentuoso"


def test_player_read_only_on_master_fields(client, p1):
    kid = kelvin_id(client, p1)
    for body in ({"level": 99}, {"stats": []}, {"skills": []}, {"inventory": []}, {"reputation": []}):
        r = patch(client, p1, kid, body)
        assert r.status_code == 403, body
    assert patch(client, p1, kid, {"classe": "Mago"}).status_code == 422
    assert patch(client, p1, kid, {"resources": {"hp": 99999, "mp": 0, "sp": 0}}).status_code == 422
