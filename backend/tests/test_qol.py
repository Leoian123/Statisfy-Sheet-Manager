"""Riposo del gruppo (POST /api/forge/party/rest): risorse al massimo, effetti e ricariche azzerati, solo Master."""
from test_ki import char_id, der, get


def hurt(client, h, cid, amount=500):
    r = client.post(f"/api/characters/{cid}/combat/action", json={"type": "damage", "amount": amount}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def add_effect(client, h, cid):
    r = client.post(f"/api/characters/{cid}/combat/effects", json={"name": "Veleno", "kind": "bad", "turns": 3, "hpPerTurn": -10},
                    headers=h)
    assert r.status_code == 200, r.text


def test_rest_whole_party(client, master):
    kid, cid = char_id(client, master, "Kelvin"), char_id(client, master, "Corax")
    hurt(client, master, kid)
    add_effect(client, master, kid)
    client.post(f"/api/characters/{cid}/combat/action", json={"type": "spend_ki", "amount": 100}, headers=master)
    client.post(f"/api/characters/{kid}/combat/end-turn", headers=master)

    r = client.post("/api/forge/party/rest", json={}, headers=master)
    assert r.status_code == 200, r.text
    assert {x["name"] for x in r.json()["rested"]} >= {"Kelvin", "Corax"}

    k = get(client, master, kid)
    assert k["resources"]["hp"] == der(k, "hp")["value"]
    assert k["combat"]["effects"] == [] and k["combat"]["cooldowns"] == [] and k["combat"]["turn"] == 1
    assert k["combat"]["log"][-1].endswith("Riposo: risorse al massimo, effetti e ricariche azzerati.")
    c = get(client, master, cid)
    assert c["resources"]["ki"] == der(c, "ki")["value"]
    # chi non ha la statistica KI non riceve una risorsa KI
    assert "ki" not in k["resources"]


def test_rest_selected_keeps_effects(client, master):
    kid, eid = char_id(client, master, "Kelvin"), char_id(client, master, "Eric")
    hurt(client, master, kid)
    add_effect(client, master, kid)
    before_eric = get(client, master, eid)["resources"]["hp"]
    hurt(client, master, eid, 100)

    r = client.post("/api/forge/party/rest", json={"char_ids": [kid], "clear_effects": False}, headers=master)
    assert r.status_code == 200, r.text
    assert [x["id"] for x in r.json()["rested"]] == [kid]
    k = get(client, master, kid)
    assert k["resources"]["hp"] == der(k, "hp")["value"]
    assert "Veleno" in [e["name"] for e in k["combat"]["effects"]]
    assert k["combat"]["log"][-1].endswith("Riposo: risorse al massimo.")
    # Eric non era tra i scelti: resta ferito
    assert get(client, master, eid)["resources"]["hp"] < before_eric


def test_rest_clears_death_outcome(client, master):
    kid = char_id(client, master, "Kelvin")
    r = client.post(f"/api/characters/{kid}/death", json={"hubris": False, "respawn": "checkpoint"}, headers=master)
    assert r.status_code == 200, r.text
    assert get(client, master, kid)["death"]
    client.post("/api/forge/party/rest", json={"char_ids": [kid]}, headers=master)
    assert not get(client, master, kid)["death"]


def test_rest_is_master_only(client, p1):
    kid = char_id(client, p1, "Kelvin")
    r = client.post("/api/forge/party/rest", json={"char_ids": [kid]}, headers=p1)
    assert r.status_code == 403


def test_rest_validation(client, master):
    assert client.post("/api/forge/party/rest", json={"char_ids": [999999]}, headers=master).status_code == 404
    assert client.post("/api/forge/party/rest", json={"char_ids": "tutti"}, headers=master).status_code == 422
    assert client.post("/api/forge/party/rest", json={"extra": 1}, headers=master).status_code == 422
    assert client.post("/api/forge/party/rest", json={"char_ids": list(range(201))}, headers=master).status_code == 422
    # elenco vuoto: nessuno riposa, nessun errore
    r = client.post("/api/forge/party/rest", json={"char_ids": []}, headers=master)
    assert r.status_code == 200 and r.json()["rested"] == []
