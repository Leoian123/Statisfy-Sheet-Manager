"""Diario dell'avventuriero: visibilità, allegati verificati dal server, limiti e concorrenza."""
from conftest import login
from test_ki import char_id

J = "/api/journal"


def roll(client, h, cid, reason="Scassinare"):
    r = client.post(f"/api/table/characters/{cid}/rolls", json={"call": "sopra", "reason": reason}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def new(client, h, **kw):
    body = {"title": "Sessione al porto", "body": "Abbiamo incontrato Marta.", **kw}
    return client.post(J, json=body, headers=h)


def test_create_with_attachments_snapshot(client, p1):
    kid = char_id(client, p1, "Kelvin")
    rr = roll(client, p1, kid)
    k = client.get(f"/api/characters/{kid}", headers=p1).json()
    item, title, quest = k["inventory"][0]["name"], k["titles"][0]["name"], k["quests"][0]["name"]
    r = new(client, p1, char_id=kid, tags=["Porto", "porto", "  Marta  ", ""], attachments=[
        {"kind": "roll", "ref": str(rr["id"])}, {"kind": "item", "ref": item.upper()}, {"kind": "title", "ref": title},
        {"kind": "quest", "ref": quest}, {"kind": "quest", "ref": "Ambasceria a Qadesh"}, {"kind": "roll", "ref": str(rr["id"])}])
    # «Ambasceria a Qadesh» è una quest della campagna di Eric e Connor: per Kelvin non esiste
    assert r.status_code == 422, r.text
    r = new(client, p1, char_id=kid, tags=["Porto", "porto", "  Marta  ", ""], attachments=[
        {"kind": "roll", "ref": str(rr["id"])}, {"kind": "item", "ref": item.upper()}, {"kind": "title", "ref": title},
        {"kind": "quest", "ref": quest}, {"kind": "quest", "ref": "Il Wyrm che non brucia"}, {"kind": "roll", "ref": str(rr["id"])}])
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["tags"] == ["porto", "marta"]
    kinds = [a["kind"] for a in e["attachments"]]
    assert kinds[:4] == ["roll", "item", "title", "quest"]  # doppioni tolti
    assert e["attachments"][0]["label"] == "Scassinare" and f"d100 {rr['natural']}" in e["attachments"][0]["detail"]
    assert e["attachments"][1]["ref"] == item  # nome canonico della scheda, non quello scritto dal client
    assert e["session"] >= 1 and e["mine"] and e["char_name"] == "Kelvin" and e["visibility"] == "privato"


def test_private_is_invisible_even_to_master(client, p1, p2, master):
    eid = new(client, p1).json()["id"]
    for h in (p2, master):
        assert client.get(f"{J}/{eid}", headers=h).status_code == 404
        assert all(x["id"] != eid for x in client.get(J, headers=h).json()["items"])
        assert client.delete(f"{J}/{eid}", headers=h).status_code == 404
        assert client.patch(f"{J}/{eid}", json={"title": "x"}, headers=h).status_code == 404


def test_group_visibility_and_moderation(client, p1, p2, master):
    eid = new(client, p1, visibility="gruppo").json()["id"]
    assert client.get(f"{J}/{eid}", headers=p2).status_code == 200
    assert client.patch(f"{J}/{eid}", json={"title": "Mio ora"}, headers=p2).status_code == 403
    assert client.delete(f"{J}/{eid}", headers=p2).status_code == 403
    assert client.get(J, params={"scope": "gruppo"}, headers=master).json()["total"] == 1
    assert client.delete(f"{J}/{eid}", headers=master).status_code == 204


def test_cannot_attach_foreign_things(client, p1, p2, master):
    kid, eid_ = char_id(client, p1, "Kelvin"), char_id(client, master, "Eric")
    eric_roll = roll(client, p2, eid_)
    # tiro di un altro giocatore
    assert new(client, p1, attachments=[{"kind": "roll", "ref": str(eric_roll["id"])}]).status_code == 422
    # PG di un altro giocatore
    assert new(client, p1, char_id=eid_).status_code == 404
    # oggetto che Kelvin non ha
    assert new(client, p1, char_id=kid, attachments=[{"kind": "item", "ref": "Spada di nessuno"}]).status_code == 422
    # oggetto senza PG scelto
    assert new(client, p1, attachments=[{"kind": "title", "ref": "Qualsiasi"}]).status_code == 422
    # ref non numerici o enormi per i tiri
    for ref in ("abc", "-1", "0", str(2 ** 70)):
        assert new(client, p1, attachments=[{"kind": "roll", "ref": ref}]).status_code == 422, ref
    # tipo sconosciuto e campi extra
    assert new(client, p1, attachments=[{"kind": "npc", "ref": "Marta"}]).status_code == 422
    assert new(client, p1, attachments=[{"kind": "roll", "ref": "1", "label": "falso"}]).status_code == 422


def test_secret_master_roll_only_private(client, master):
    r = client.post("/api/table/rolls", json={"reason": "Trappola", "secret": True}, headers=master)
    assert r.status_code == 201, r.text
    rid = str(r.json()["id"])
    assert new(client, master, visibility="gruppo", attachments=[{"kind": "roll", "ref": rid}]).status_code == 422
    e = new(client, master, attachments=[{"kind": "roll", "ref": rid}])
    assert e.status_code == 201
    # rendere pubblica una pagina con un tiro segreto: rifiutato
    assert client.patch(f"{J}/{e.json()['id']}", json={"visibility": "gruppo"}, headers=master).status_code == 422


def test_player_cannot_attach_secret_roll(client, p1, master):
    rid = client.post("/api/table/rolls", json={"reason": "Segreto", "secret": True}, headers=master).json()["id"]
    assert new(client, p1, attachments=[{"kind": "roll", "ref": str(rid)}]).status_code == 422


def test_validation_limits(client, p1):
    assert new(client, p1, title="").status_code == 422
    assert new(client, p1, title="   \u0000\u0007  ").status_code == 422
    assert new(client, p1, title="x" * 121).status_code == 422
    assert new(client, p1, body="x" * 20001).status_code == 422
    assert new(client, p1, tags=[f"t{i}" for i in range(9)]).status_code == 422
    assert new(client, p1, attachments=[{"kind": "quest", "ref": "Taglia su Dante"}] * 13).status_code == 422
    assert new(client, p1, visibility="pubblico").status_code == 422
    assert client.post(J, json={"title": "ok", "extra": 1}, headers=p1).status_code == 422
    e = new(client, p1, title="Con\u0000 controllo\u0007", body="riga1\r\nriga2\u0000").json()
    assert e["title"] == "Con controllo" and e["body"] == "riga1\nriga2"


def test_html_is_stored_as_text(client, p1):
    e = new(client, p1, title="<img src=x onerror=alert(1)>", body="<script>alert(1)</script>").json()
    # nessuna sanificazione distruttiva: il testo resta com'è e il frontend lo mostra come testo, mai come HTML
    assert e["title"] == "<img src=x onerror=alert(1)>" and e["body"] == "<script>alert(1)</script>"


def test_filters_pin_and_search(client, p1):
    kid = char_id(client, p1, "Kelvin")
    a = new(client, p1, title="Primo", tags=["drago"]).json()
    b = new(client, p1, title="Secondo", body="Il wyrm dorme", char_id=kid).json()
    c = new(client, p1, title="Terzo", pinned=True).json()
    items = client.get(J, headers=p1).json()["items"]
    assert items[0]["id"] == c["id"]  # fissata in cima
    assert [x["id"] for x in client.get(J, params={"tag": "DRAGO"}, headers=p1).json()["items"]] == [a["id"]]
    assert [x["id"] for x in client.get(J, params={"q": "WYRM"}, headers=p1).json()["items"]] == [b["id"]]
    assert [x["id"] for x in client.get(J, params={"char_id": kid}, headers=p1).json()["items"]] == [b["id"]]
    res = client.get(J, params={"limit": 1, "offset": 1}, headers=p1).json()
    assert res["total"] == 3 and len(res["items"]) == 1
    assert "drago" in res["tags"]
    assert client.get(J, params={"limit": 0}, headers=p1).status_code == 422
    assert client.get(J, params={"limit": 999}, headers=p1).status_code == 422


def test_patch_version_conflict_and_fields(client, p1):
    e = new(client, p1).json()
    r = client.patch(f"{J}/{e['id']}", json={"version": e["version"], "title": "Nuovo", "pinned": True, "tags": ["A"]}, headers=p1)
    assert r.status_code == 200 and r.json()["title"] == "Nuovo" and r.json()["tags"] == ["a"]
    assert client.patch(f"{J}/{e['id']}", json={"version": e["version"], "title": "Vecchio"}, headers=p1).status_code == 409
    assert client.patch(f"{J}/{e['id']}", json={"title": "   "}, headers=p1).status_code == 422
    # togliere il PG: gli allegati già salvati restano (sono istantanee)
    assert client.patch(f"{J}/{e['id']}", json={"char_id": None}, headers=p1).status_code == 200


def test_attachables(client, p1, p2):
    kid = char_id(client, p1, "Kelvin")
    roll(client, p1, kid)
    a = client.get(f"{J}/attachables", params={"char_id": kid}, headers=p1).json()
    assert a["roll"] and a["item"] and a["title"] and a["quest"]
    # quest della campagna: solo quelle dei propri PG (il resto è del Master)
    assert not any(q["ref"] == "Taglia su Dante" for q in a["quest"])
    from conftest import login
    m = client.get(f"{J}/attachables", headers=login(client, "master")).json()
    assert any(q["ref"] == "Taglia su Dante" for q in m["quest"])
    assert client.get(f"{J}/attachables", params={"char_id": kid}, headers=p2).status_code == 404
    no_char = client.get(f"{J}/attachables", headers=p1).json()
    assert no_char["roll"] == []


def test_requires_login(client):
    assert client.get(J).status_code == 401
    assert client.post(J, json={"title": "x"}).status_code == 401


def test_entry_cap(client, p1, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "JOURNAL_MAX_ENTRIES", 2)
    assert new(client, p1).status_code == 201
    assert new(client, p1).status_code == 201
    assert new(client, p1).status_code == 422


def test_survives_character_deletion_shape(client, p1):
    """Gli allegati sono istantanee: la pagina si legge anche se l'oggetto esce dall'inventario."""
    kid = char_id(client, p1, "Kelvin")
    k = client.get(f"/api/characters/{kid}", headers=p1).json()
    e = new(client, p1, char_id=kid, attachments=[{"kind": "item", "ref": k["inventory"][0]["name"]}]).json()
    got = client.get(f"{J}/{e['id']}", headers=p1).json()
    assert got["attachments"][0]["label"] == k["inventory"][0]["name"]


def test_other_player_sees_group_only(client, p1):
    p3 = login(client, "giocatore3")
    new(client, p1, title="privata")
    new(client, p1, title="condivisa", visibility="gruppo")
    titles = [x["title"] for x in client.get(J, headers=p3).json()["items"]]
    assert titles == ["condivisa"]
    assert client.get(J, params={"scope": "miei"}, headers=p3).json()["total"] == 0
