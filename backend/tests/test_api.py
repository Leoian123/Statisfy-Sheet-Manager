from conftest import login


def kelvin_id(client, h):
    return next(c["id"] for c in client.get("/api/characters", headers=h).json() if c["name"] == "Kelvin")


def test_login_ok_ko(client):
    r = client.post("/api/auth/login", json={"username": "master", "password": "master"})
    assert r.status_code == 200
    assert r.json()["user"] == {"id": 1, "username": "master", "display_name": "Il Narratore", "role": "master"}
    tok = r.json()["token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).json()["role"] == "master"
    r = client.post("/api/auth/login", json={"username": "master", "password": "x"})
    assert r.status_code == 401 and isinstance(r.json()["detail"], str)
    assert client.get("/api/auth/me").status_code == 401


def test_rules_endpoint(client):
    r = client.get("/api/rules").json()
    assert r["creation"] == {"base": 10, "bonus_points": 20, "min": 1, "name_min": 3, "name_max": 15}
    assert r["regen"] == {"mp_pct": 15, "sp_pct": 25}
    assert len(r["rarities"]) == 8 and r["rarities"][1]["key"] == "noncomune"
    assert r["classes"][0]["equip"][0]["type"] == "Arma"
    assert len(r["grades"]) == 10


def test_preview(client, p1):
    stats = [{"code": "STR", "iniziale": 10, "creazione": 5}, {"code": "VIT", "iniziale": 10, "creazione": 10}]
    r = client.post("/api/rules/preview", headers=p1, json={"stats": stats}).json()
    assert r["totals"] == {"STR": 15, "VIT": 20}
    assert next(d for d in r["derived"] if d["key"] == "hp")["value"] == 400


def test_kelvin_character(client, p1):
    kid = kelvin_id(client, p1)
    c = client.get(f"/api/characters/{kid}", headers=p1).json()
    assert c["owner_name"] == "Giocatore 1"
    assert c["totals"]["DEX"] == 492
    assert c["free_points"] == {"total": 760, "used": 760, "left": 0}
    assert c["stats"][0]["total"] == 170
    assert c["next_talent_level"] == 80
    assert c["combat"]["position"] == "Media distanza"


def test_player_isolation(client, master, p1, p2):
    assert len(client.get("/api/characters", headers=master).json()) == 6
    mine = client.get("/api/characters", headers=p2).json()
    assert [c["name"] for c in mine] == ["Eric"]
    kid = kelvin_id(client, master)
    assert client.get(f"/api/characters/{kid}", headers=p2).status_code == 404
    assert client.post(f"/api/characters/{kid}/level-up", headers=p2).status_code == 404
    for path in ("/api/npcs", "/api/campaign", "/api/issues"):
        assert client.get(path, headers=p1).status_code == 403
    assert client.delete(f"/api/characters/{kid}", headers=p1).status_code == 403


def test_create_character(client, p2):
    body = {"name": "Aria", "classe_id": "guerriero", "stats": {"STR": 20, "DEX": 15, "VIT": 15, "INT": 10},
            "regno_id": "valeria"}
    r = client.post("/api/characters", json=body, headers=p2)
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["level"] == 1 and c["exp_pct"] == 0 and c["pvp"] == "Bianco" and c["corone"] == 20
    assert c["classe"] == "Guerriero" and c["regno"] == "Valeria"
    assert c["resources"] == {"hp": 325, "mp": 150, "sp": 225}
    assert c["active_skills"][0]["name"] == "Attacco Possente" and c["active_skills"][0]["cd"] == 3
    coins = c["inventory"][-1]
    assert (coins["name"], coins["stats_text"], coins["type"], coins["qty"], coins["weight"]) ==         ("Corone d'Oro", "Moneta di Valeria", "Monete", 20, 0)
    assert coins["category"] == "altro" and coins["slot"] is None and coins["id"]
    # Equipaggiamento iniziale indossato in automatico (requisito STR 15 soddisfatto con STR 20)
    assert c["equipped"] == {"manoPrincipale": c["inventory"][0]["id"], "torso": c["inventory"][1]["id"],
                             "manoSecondaria": c["inventory"][2]["id"]}
    d = {x["key"]: x for x in c["derived"]}
    assert d["blocco"]["value"] == 20.5  # Blocco scudo 20 + STR/40 (20/40)
    assert d["difesa"]["explain"] == "15/10 + 5 × (1 + 15/100)"
    assert all(i["rarity"] == "Comune" for i in c["inventory"])
    assert c["combat"]["position"] == "Mischia"
    assert c["free_points"] == {"total": 0, "used": 0, "left": 0}
    assert c["owner_id"] == 3


def test_create_character_invalid(client, p2):
    ok = {"name": "Aria", "classe_id": "guerriero", "stats": {"STR": 20, "DEX": 15, "VIT": 15, "INT": 10},
          "regno_id": "valeria"}
    cases = [
        {**ok, "stats": {"STR": 20, "DEX": 15, "VIT": 15, "INT": 11}},  # 21 punti
        {**ok, "stats": {"STR": 19, "DEX": 15, "VIT": 15, "INT": 10}},  # 19 punti
        {**ok, "name": "kelvin"},  # duplicato case-insensitive
        {**ok, "name": "Ari a"},  # spazio
        {**ok, "name": "Ab"},  # troppo corto
        {**ok, "stats": {"STR": 0, "DEX": 25, "VIT": 15, "INT": 20}},  # stat < 1
        {**ok, "classe_id": "bardo"},
        {**ok, "regno_id": "atlantide"},
        {k: v for k, v in ok.items() if k != "name"},  # campo mancante
    ]
    for body in cases:
        r = client.post("/api/characters", json=body, headers=p2)
        assert r.status_code == 422, (body, r.text)
        assert isinstance(r.json()["detail"], str)


def test_patch_permissions(client, master, p1):
    kid = kelvin_id(client, p1)
    r = client.patch(f"/api/characters/{kid}", json={"resources": {"hp": 100, "mp": 100, "sp": 100},
                                                      "combat": {"position": "Coperto"}}, headers=p1)
    assert r.status_code == 200
    assert r.json()["resources"] == {"hp": 100, "mp": 100, "sp": 100}
    assert r.json()["combat"]["position"] == "Coperto"
    assert client.patch(f"/api/characters/{kid}", json={"corone": 99}, headers=p1).status_code == 403
    assert client.patch(f"/api/characters/{kid}", json={"name": "Pippo"}, headers=master).status_code == 422
    r = client.patch(f"/api/characters/{kid}", json={"combat": {"position": "Altrove"}}, headers=p1)
    assert r.status_code == 422
    r = client.patch(f"/api/characters/{kid}", json={"corone": 99, "item_bonus": {"critico": 100}}, headers=master)
    assert r.status_code == 200
    d = {x["key"]: x for x in r.json()["derived"]}
    assert r.json()["corone"] == 99 and d["critico"]["value"] == 75


def test_level_up_and_distribute(client, p1):
    kid = kelvin_id(client, p1)
    for _ in range(3):
        r = client.post(f"/api/characters/{kid}/level-up", headers=p1)
    c = r.json()
    assert c["level"] == 80
    assert c["free_points"] == {"total": 790, "used": 760, "left": 30}
    assert c["stats"][0]["levelup"] == 79 and c["stats"][5]["levelup"] == 10
    assert any("Nuovo talento disponibile" in line for line in c["combat"]["log"])
    r = client.post(f"/api/characters/{kid}/distribute", json={"alloc": {"STR": 31}}, headers=p1)
    assert r.status_code == 422
    r = client.post(f"/api/characters/{kid}/distribute", json={"alloc": {"XYZ": 1}}, headers=p1)
    assert r.status_code == 422
    r = client.post(f"/api/characters/{kid}/distribute", json={"alloc": {"STR": 20, "FIN": 10}}, headers=p1)
    assert r.status_code == 200
    c = r.json()
    assert c["free_points"]["left"] == 0
    assert c["totals"]["STR"] == 170 + 3 + 20


def test_combat_damage_with_shield(client, p1):
    kid = kelvin_id(client, p1)
    url = f"/api/characters/{kid}/combat/action"
    r = client.post(url, json={"type": "damage", "amount": 30}, headers=p1).json()
    shield = next(e for e in r["combat"]["effects"] if e["name"] == "Scudo Magico")
    assert shield["absorb"] == 20 and shield["text"] == "Assorbe 20 danni" and r["resources"]["hp"] == 2410
    r = client.post(url, json={"type": "damage", "amount": 100}, headers=p1).json()
    assert all(e["name"] != "Scudo Magico" for e in r["combat"]["effects"])
    assert r["resources"]["hp"] == 2410 - 80
    assert r["combat"]["log"][-1].startswith("T1 · Subiti 80 danni")
    r = client.post(url, json={"type": "damage", "amount": 99999}, headers=p1).json()
    assert r["resources"]["hp"] == 0
    r = client.post(url, json={"type": "heal", "amount": 99999}, headers=p1).json()
    assert r["resources"]["hp"] == 2890
    assert client.post(url, json={"type": "spend_mp", "amount": 641}, headers=p1).status_code == 422
    r = client.post(url, json={"type": "spend_mp", "amount": 40}, headers=p1)
    assert r.json()["resources"]["mp"] == 600
    r = client.post(url, json={"type": "damage", "amount": 0}, headers=p1)
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)


def test_end_turn(client, p1):
    kid = kelvin_id(client, p1)
    r = client.post(f"/api/characters/{kid}/combat/end-turn", headers=p1).json()
    # MP 640 + 15% di 910 (137) = 777; SP 2900 + min(460, 840) = 3360; Emorragia −3 HP
    assert r["resources"] == {"hp": 2407, "mp": 777, "sp": 3360}
    assert r["combat"]["turn"] == 2
    effects = {e["name"]: e["turns"] for e in r["combat"]["effects"]}
    assert effects == {"Emorragia": 1, "Scudo Magico": 2}  # Concentrazione scaduta
    assert {c["name"]: c["turns"] for c in r["combat"]["cooldowns"]} == {"Comando: Battaglia": 1,
                                                                         "Comando: Sottomissione": 3}
    r = client.post(f"/api/characters/{kid}/combat/end-turn", headers=p1).json()
    assert r["resources"]["hp"] == 2404 and r["resources"]["mp"] == 910
    assert [e["name"] for e in r["combat"]["effects"]] == ["Scudo Magico"]
    assert [c["name"] for c in r["combat"]["cooldowns"]] == ["Comando: Sottomissione"]


def test_effects_and_reset(client, p1):
    kid = kelvin_id(client, p1)
    r = client.post(f"/api/characters/{kid}/combat/effects",
                    json={"name": "Veleno", "kind": "bad", "turns": 2, "hpPerTurn": -10}, headers=p1)
    assert r.status_code == 200 and r.json()["combat"]["effects"][-1]["name"] == "Veleno"
    r = client.delete(f"/api/characters/{kid}/combat/effects/0", headers=p1).json()
    assert r["combat"]["effects"][0]["name"] == "Scudo Magico"
    assert client.delete(f"/api/characters/{kid}/combat/effects/9", headers=p1).status_code == 404
    r = client.post(f"/api/characters/{kid}/combat/reset", headers=p1).json()
    assert r["combat"]["turn"] == 1 and r["combat"]["effects"] == [] and r["combat"]["log"] == []


def test_death(client, p1):
    kid = kelvin_id(client, p1)
    r = client.post(f"/api/characters/{kid}/death", json={"hubris": False, "respawn": "checkpoint"}, headers=p1).json()
    assert r["level"] == 75 and r["exp_pct"] == 50
    assert r["death"] == {"lost": 1.5, "malus": "−10% a tutte le statistiche per 1 ora",
                          "bonus": "+50% EXP per 30 minuti", "protected": False}
    assert r["resources"] == {"hp": 1445, "mp": 455, "sp": 1680}
    assert r["combat"]["effects"] == [] and r["combat"]["cooldowns"] == []
    r = client.post(f"/api/characters/{kid}/death", json={"hubris": True, "respawn": "here"}, headers=p1).json()
    assert r["level"] == 72 and r["exp_pct"] == 50 and r["death"]["lost"] == 3
    assert r["resources"] == {"hp": 1, "mp": 455, "sp": 1680}
    # livello protetto
    body = {"name": "Nuovo1", "classe_id": "mago", "stats": {"STR": 10, "DEX": 10, "VIT": 10, "INT": 30},
            "regno_id": "qadesh"}
    nid = client.post("/api/characters", json=body, headers=p1).json()["id"]
    r = client.post(f"/api/characters/{nid}/death", json={"hubris": True, "respawn": "checkpoint"}, headers=p1).json()
    assert r["level"] == 1 and r["death"]["protected"] is True
    # l'esito si azzera all'azione di combattimento successiva
    r = client.post(f"/api/characters/{nid}/combat/end-turn", headers=p1).json()
    assert r["death"] is None


def test_master_routes(client, master):
    c = client.get("/api/campaign", headers=master).json()
    assert c["name"] == "Campagna di Alba Chiara" and c["session"] == 15 and c["master_name"] == "Il Narratore"
    assert len(c["open_quests"]) == 3
    assert client.post("/api/campaign/session", headers=master).json()["session"] == 16
    npcs = client.get("/api/npcs", headers=master).json()
    assert len(npcs) == 3
    nid = npcs[0]["id"]
    r = client.post(f"/api/npcs/{nid}/interactions", json={"text": "Ha offerto da bere"}, headers=master).json()
    assert r["last"] == "Sessione 16 — Ha offerto da bere" and r["history"][0]["session"] == 16
    r = client.patch(f"/api/npcs/{nid}", json={"trust": "Eccellente"}, headers=master).json()
    assert r["trust"] == "Eccellente"
    assert client.patch(f"/api/npcs/{nid}", json={"trust": "Pessimo"}, headers=master).status_code == 422
    r = client.post("/api/npcs", json={"name": "Gino"}, headers=master)
    assert r.status_code == 201 and r.json()["history"] == []
    issues = client.get("/api/issues", headers=master).json()
    assert len(issues) == 5 and issues[0]["resolved"] is True and issues[3]["resolved"] is True
    r = client.patch(f"/api/issues/{issues[3]['id']}", json={"resolved": False, "decision": None},
                     headers=master).json()
    assert r["resolved"] is False and r["decision"] is None
    r = client.patch(f"/api/issues/{issues[3]['id']}", json={"resolved": True, "decision": "Corretti a 180."},
                     headers=master).json()
    assert r["resolved"] is True and r["decision"] == "Corretti a 180."


def test_master_creates_for_player(client, master):
    body = {"name": "Ombra", "classe_id": "ladro", "stats": {"STR": 10, "DEX": 30, "VIT": 10, "INT": 10},
            "regno_id": "frostland", "owner_id": 4}
    r = client.post("/api/characters", json=body, headers=master)
    assert r.status_code == 201 and r.json()["owner_name"] == "Giocatore 3"
    p3 = login(client, "giocatore3")
    assert {c["name"] for c in client.get("/api/characters", headers=p3).json()} == {"Corax", "Ombra"}
