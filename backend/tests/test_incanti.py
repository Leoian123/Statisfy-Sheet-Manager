"""Richieste di incantesimo: il giocatore compone con il wizard della Forgia, il Master approva o respinge."""
import copy

from test_ki import char_id

T = "/api/tickets"
I = "/api/tickets/incanti"

MECH = {"v": 1, "effetti": [{"azione": {"op": "danno"}, "formula": {"base": "incantesimo", "tipo": "Vis"}}]}


def spell(cid, **kw):
    return {"name": "Dardo di Forza", "effect": "Un proiettile di energia pura", "origin": "grimorio", "mech": copy.deepcopy(MECH),
            "spheres": [{"s": "Vis", "role": "forma", "trav": False}], "combo": False, "level": 1, "meta": [],
            "env": {"zone": "", "ley": 0, "anti": False}, "risk": {"overcast": "auto", "protections": 0},
            "cost": None, "cd": None, "charId": cid, **kw}


def miracle(cid, **kw):
    return {"god": "luxor", "name": "Luce che Risana", "nature": "guarigione", "effect": "Chiude le ferite di un alleato",
            "level": 1, "fede": None, "favor": None, "cost": None, "cd": None, "vows": ["Non mentire sotto giuramento"],
            "customVows": "", "against": "indebolito", "againstNote": "", "charId": cid,
            "mech": {"v": 1, "effetti": [{"bersaglio": {"lato": "alleato", "forma": "singolo"}, "azione": {"op": "cura"},
                                          "formula": {"base": "incantesimo", "tipo": "magico"}}]}, **kw}


def send(client, h, kind, draft, note=""):
    return client.post(I, json={"kind": kind, "draft": draft, "note": note}, headers=h)


def skills(client, h, cid):
    return [s["name"] for s in client.get(f"/api/characters/{cid}", headers=h).json()["active_skills"]]


def test_player_meta_and_preview_see_only_own_characters(client, p1, p2):
    kid = char_id(client, p1, "Kelvin")
    m = client.get(f"{I}/meta", headers=p1).json()
    assert [c["name"] for c in m["characters"]] == ["Kelvin"] and m["characters"][0]["cleric"] is False
    assert set(m["steps"]) == {"spells", "miracles"} and m["spell_origins"] and m["gods"] and m["mech"]
    assert m["library_skills"] == [] and m["known_titles"] == []
    pv = client.post(f"{I}/preview", json={"kind": "spells", "draft": spell(kid)}, headers=p1).json()
    assert pv["first_bad"] == -1 and pv["computed"]["char"]["name"] == "Kelvin" and pv["computed"]["cost"] == 20
    # un PG altrui non entra nel contesto: l'anteprima non ne rivela i dati
    eric = char_id(client, p2, "Eric")
    pv = client.post(f"{I}/preview", json={"kind": "spells", "draft": spell(eric)}, headers=p1).json()
    assert pv["computed"]["char"] is None
    # il giocatore non può assegnare né forzare: i campi vengono ignorati
    pv = client.post(f"{I}/preview", json={"kind": "spells", "draft": spell(kid, assign=True, force=True,
                     spheres=[{"s": "Vis", "role": "forma", "trav": False}, {"s": "Ignis", "role": "sostanza", "trav": False}])},
                     headers=p1).json()
    assert pv["first_bad"] == -1  # sfere mancanti: non bloccano l'invio, le valuta il Master
    assert client.get(f"{I}/meta").status_code == 401


def test_send_validate_and_approve(client, p1, p2, master):
    kid = char_id(client, p1, "Kelvin")
    # bozza incompleta: errore del passo
    r = send(client, p1, "spells", spell(kid, mech=None))
    assert r.status_code == 422 and "Passo 2" in r.json()["detail"]
    # PG altrui
    assert send(client, p1, "spells", spell(char_id(client, p2, "Eric"))).status_code == 404
    assert send(client, p1, "spells", spell("")).status_code == 422
    r = send(client, p1, "spells", spell(kid), note="Lo uso contro i golem")
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["kind"] == "incanto" and t["title"] == "Incantesimo: Dardo di Forza" and t["char_name"] == "Kelvin"
    assert "Lo uso contro i golem" in t["body"] and t["meta"]["forge_kind"] == "spells"
    card = t["meta"]["card"]
    assert "20 MP" in card["summary"] and "15–30" in card["mech_text"] and card["issues"] == []
    assert t["meta"]["draft"]["assign"] is False
    assert client.get(f"{T}/summary", headers=master).json()["count"] == 1
    # «Risolvi» e la modifica di titolo e testo non valgono per gli incantesimi
    assert client.patch(f"{T}/{t['id']}", json={"status": "risolta", "answer": "ok"}, headers=master).status_code == 422
    assert client.patch(f"{T}/{t['id']}", json={"title": "Altro titolo"}, headers=p1).status_code == 422
    # solo il Master approva
    assert client.post(f"{I}/{t['id']}/approva", json={}, headers=p1).status_code == 403
    assert client.post(f"{I}/{t['id']}/approva", json={"version": t["version"] + 5}, headers=master).status_code == 409
    r = client.post(f"{I}/{t['id']}/approva", json={"version": t["version"]}, headers=master)
    assert r.status_code == 200, r.text
    done = r.json()["ticket"]
    assert done["status"] == "risolta" and "grimorio di Kelvin" in done["answer"] and done["meta"]["learned"] is True
    assert done["meta"]["entry_id"] and any("grimorio" in m for m in r.json()["messages"])
    assert "Dardo di Forza" in skills(client, master, kid)
    lib = client.get("/api/forge/library?kind=spells", headers=master).json()
    assert [e["name"] for e in lib] == ["Dardo di Forza"] and lib[0]["assigned_to"] == kid
    # il giocatore la vede risolta e non letta
    assert client.get(T, headers=p1).json()["items"][0]["unread"] is True
    assert client.post(f"{I}/{t['id']}/approva", json={}, headers=master).status_code == 409
    # stesso nome già nel grimorio: non si richiede di nuovo
    assert send(client, p1, "spells", spell(kid)).status_code == 409


def test_master_edits_and_forces(client, p1, master):
    kid = char_id(client, p1, "Kelvin")
    two = spell(kid, name="Fiamma di Forza",
                spheres=[{"s": "Vis", "role": "forma", "trav": False}, {"s": "Ignis", "role": "sostanza", "trav": False}])
    t = send(client, p1, "spells", two).json()
    assert any("Ignis" in i for i in t["meta"]["card"]["issues"])
    # senza forzare l'assegnazione non passa
    r = client.post(f"{I}/{t['id']}/approva", json={}, headers=master)
    assert r.status_code == 422 and "forza" in r.json()["detail"]
    # il Master ritocca la bozza (costo contrattato) e forza
    d = {**t["meta"]["draft"], "cost": 35, "charId": "999"}
    r = client.post(f"{I}/{t['id']}/approva", json={"draft": d, "force": True, "risposta": "Va bene, ma costa di più."}, headers=master)
    assert r.status_code == 200, r.text
    assert r.json()["ticket"]["answer"] == "Va bene, ma costa di più."
    assert "35 MP" in r.json()["ticket"]["meta"]["card"]["summary"]
    sk = next(s for s in client.get(f"/api/characters/{kid}", headers=master).json()["active_skills"] if s["name"] == "Fiamma di Forza")
    assert sk["cost"] == "35 MP"  # il PG resta quello della richiesta, non quello della bozza


def test_player_revises_then_master_rejects(client, p1, p2, master):
    kid = char_id(client, p1, "Kelvin")
    t = send(client, p1, "spells", spell(kid), note="prima nota").json()
    client.patch(f"{T}/{t['id']}", json={"status": "in_esame"}, headers=master)
    client.post(f"{T}/{t['id']}/messages", json={"text": "Abbassa il livello o cambia nome"}, headers=master)
    t = client.get(f"{T}/{t['id']}", headers=p1).json()
    # altri non la modificano; versione vecchia → 409
    assert client.put(f"{I}/{t['id']}", json={"draft": spell(kid)}, headers=p2).status_code == 404
    assert client.put(f"{I}/{t['id']}", json={"draft": spell(kid), "version": t["version"] - 1}, headers=p1).status_code == 409
    r = client.put(f"{I}/{t['id']}", json={"draft": spell(kid, name="Dardo Minore"), "version": t["version"]}, headers=p1)
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["status"] == "aperta" and u["title"] == "Incantesimo: Dardo Minore" and "prima nota" in u["body"]
    assert u["messages"][-1]["text"] == "Ho aggiornato l'incantesimo." and u["meta"]["draft"]["name"] == "Dardo Minore"
    # il Master respinge con la risposta
    assert client.patch(f"{T}/{t['id']}", json={"status": "respinta"}, headers=master).status_code == 422
    r = client.patch(f"{T}/{t['id']}", json={"status": "respinta", "answer": "Troppo forte per ora."}, headers=master)
    assert r.status_code == 200 and r.json()["status"] == "respinta"
    assert client.put(f"{I}/{t['id']}", json={"draft": spell(kid)}, headers=p1).status_code == 409
    assert "Dardo Minore" not in skills(client, master, kid)
    # i normali ticket non si toccano con gli endpoint degli incanti
    other = client.post(T, json={"kind": "regola", "title": "Una domanda", "body": "Testo"}, headers=p1).json()
    assert client.put(f"{I}/{other['id']}", json={"draft": spell(kid)}, headers=p1).status_code == 422


def test_miracle_request(client, p1, master):
    kid = char_id(client, p1, "Kelvin")
    t = send(client, p1, "miracles", miracle(kid)).json()
    assert t["title"] == "Miracolo: Luce che Risana"
    assert any("chierico" in i for i in t["meta"]["card"]["issues"])
    r = client.post(f"{I}/{t['id']}/approva", json={"force": True}, headers=master)
    assert r.status_code == 200, r.text
    sk = client.get(f"/api/characters/{kid}", headers=master).json()["active_skills"][-1]
    assert sk["name"] == "Luce che Risana" and sk["kind"] == "Miracolo"


def test_request_limits_shared_with_tickets(client, p1, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "TICKET_MAX_ACTIVE", 1)
    kid = char_id(client, p1, "Kelvin")
    assert send(client, p1, "spells", spell(kid)).status_code == 201
    assert send(client, p1, "spells", spell(kid, name="Altro Dardo")).status_code == 429
