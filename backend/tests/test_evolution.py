"""Evoluzione delle skill: al Grado X richieste al Master e al giocatore, passiva, nuovo ciclo."""
from conftest import login

from app.mech_templates import TEMPLATES

TPL = {t["cat"]: t["mech"] for t in TEMPLATES}


def set_grade(client, master, char_id, name, lvl, field="active_skills", **extra):
    c = client.get(f"/api/characters/{char_id}", headers=master).json()
    items = [x for x in c[field] if x["name"] != name]
    items.append({"name": name, "effect": "", "lvl": lvl, "pct": 0, "cost": "", "cd": 0, **extra} if field == "active_skills"
                 else {"name": name, "lvl": lvl, "pct": 0, "type": "Arcana", **extra})
    r = client.patch(f"/api/characters/{char_id}", json={field: items}, headers=master)
    assert r.status_code == 200, r.text
    return r.json()


def tickets(client, hdr, **q):
    return client.get("/api/tickets", params=q, headers=hdr).json()["items"]


def test_grade_x_opens_pair_and_evolution_completes(client, master):
    p2 = login(client, "giocatore2")  # Eric (id 2)
    set_grade(client, master, 2, "Dardo arcano", 9, kind="Incantesimo", mech=TPL[1])
    assert not [t for t in tickets(client, master) if t["kind"] == "evoluzione"]
    set_grade(client, master, 2, "Dardo arcano", 10, kind="Incantesimo", mech=TPL[1])
    evo = [t for t in tickets(client, master) if t["kind"] == "evoluzione"]
    assert len(evo) == 1 and evo[0]["meta"]["ciclo"] == 1 and "Dardo arcano X" in evo[0]["title"]
    # Salvare di nuovo non duplica
    set_grade(client, master, 2, "Dardo arcano", 10, kind="Incantesimo", mech=TPL[1])
    assert len([t for t in tickets(client, master) if t["kind"] == "evoluzione"]) == 1
    # Il giocatore vede la comunicazione (non letta) e non la richiesta del Master
    mine = tickets(client, p2)
    com = [t for t in mine if t["kind"] == "comunicazione"]
    assert len(com) == 1 and com[0]["to_me"] and com[0]["unread"]
    assert not [t for t in mine if t["kind"] == "evoluzione"]
    assert client.get("/api/tickets/summary", headers=p2).json()["count"] >= 1
    # Un altro giocatore non la vede
    p1 = login(client, "giocatore1")
    assert client.get(f"/api/tickets/{com[0]['id']}", headers=p1).status_code == 404
    # Il giocatore propone: il messaggio arriva anche al Master
    r = client.post(f"/api/tickets/{com[0]['id']}/messages", json={"text": "Ogni incantesimo Vis lancia anche un dardo."},
                    headers=p2)
    assert r.status_code == 200
    m = client.get(f"/api/tickets/{evo[0]['id']}", headers=master).json()
    assert m["messages"][-1]["text"].startswith("Ogni incantesimo Vis")
    # Il giocatore non può chiudere né modificare la comunicazione
    assert client.patch(f"/api/tickets/{com[0]['id']}", json={"status": "ritirata"}, headers=p2).status_code == 403
    assert client.post(f"/api/tickets/{evo[0]['id']}/evoluzione", json={}, headers=p2).status_code in (403, 404)
    # Il Master definisce: passiva con meccanica + nuova meccanica della skill
    body = {"passiva_effetto": "Ogni incantesimo con traccia di Vis lancia un dardo annesso.",
            "passiva_mech": TPL[58], "skill_mech": {**TPL[1], "etichette": ["Vis", "Proiettile", "Dardo"]}}
    r = client.post(f"/api/tickets/{evo[0]['id']}/evoluzione", json=body, headers=master)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "risolta"
    c = client.get("/api/characters/2", headers=master).json()
    sk = next(x for x in c["active_skills"] if x["name"] == "Dardo arcano")
    assert sk["lvl"] == 1 and sk["cicli"] == 1 and sk["evoluzioni"][0]["passiva"] == "Dardo arcano X"
    assert "Dardo" in sk["mech"]["etichette"]
    pas = next(x for x in c["skills"] if x["name"] == "Dardo arcano X")
    assert pas["mech"]["tipo"] == "passiva" and pas["type"] == "Evoluzione · Dardo arcano"
    com2 = client.get(f"/api/tickets/{com[0]['id']}", headers=p2).json()
    assert com2["status"] == "risolta" and "Dardo arcano X" in com2["answer"]
    # Ciclo 2: di nuovo al Grado X → passiva XX
    sk_list = [dict(x, lvl=10) if x["name"] == "Dardo arcano" else x for x in c["active_skills"]]
    client.patch("/api/characters/2", json={"active_skills": sk_list}, headers=master)
    evo2 = [t for t in tickets(client, master) if t["kind"] == "evoluzione" and t["status"] == "aperta"]
    assert len(evo2) == 1 and evo2[0]["meta"]["ciclo"] == 2 and "XX" in evo2[0]["title"]
    assert client.post(f"/api/tickets/{evo2[0]['id']}/evoluzione", json={}, headers=master).status_code == 200
    names = [x["name"] for x in client.get("/api/characters/2", headers=master).json()["skills"]]
    assert "Dardo arcano XX" in names


def test_passive_skill_and_errors(client, master):
    set_grade(client, master, 1, "Alchimia", 9, field="skills")
    set_grade(client, master, 1, "Alchimia", 10, field="skills")
    evo = next(t for t in tickets(client, master) if t["kind"] == "evoluzione")
    assert evo["meta"]["field"] == "skills"
    bad = client.post(f"/api/tickets/{evo['id']}/evoluzione", json={"passiva_mech": {"v": 1, "effetti": [{"azione": {"op": "danno"}}]}},
                      headers=master)
    assert bad.status_code == 422 and "passiva" in bad.json()["detail"]
    # «risolta» a mano non è ammesso: si chiude con Definisci evoluzione
    r = client.patch(f"/api/tickets/{evo['id']}", json={"status": "risolta", "answer": "ok"}, headers=master)
    assert r.status_code == 422
    r = client.post(f"/api/tickets/{evo['id']}/evoluzione", json={"passiva_nome": "Mani d'oro", "passiva_effetto": "+10% resa"},
                    headers=master)
    assert r.status_code == 200
    c = client.get("/api/characters/1", headers=master).json()
    al = next(x for x in c["skills"] if x["name"] == "Alchimia")
    assert al["lvl"] == 1 and al["cicli"] == 1
    assert any(x["name"] == "Mani d'oro" for x in c["skills"])
    # cicli non validi
    items = [dict(x, cicli=-1) if x["name"] == "Alchimia" else x for x in c["skills"]]
    assert client.patch("/api/characters/1", json={"skills": items}, headers=master).status_code == 422


def test_rejected_evolution_can_close(client, master):
    set_grade(client, master, 1, "Cucina", 9, field="skills")
    set_grade(client, master, 1, "Cucina", 10, field="skills")
    evo = next(t for t in tickets(client, master) if t["kind"] == "evoluzione")
    r = client.patch(f"/api/tickets/{evo['id']}", json={"status": "respinta", "answer": "Non ancora."}, headers=master)
    assert r.status_code == 200 and r.json()["status"] == "respinta"


def test_existing_grade_x_needs_manual_open(client, master):
    c = client.get("/api/characters/2", headers=master).json()
    items = c["skills"] + [{"name": "Ispeziona Oggetto", "lvl": 10, "pct": 0, "type": "Generale"}]
    client.patch("/api/characters/2", json={"skills": items}, headers=master)  # nuova già al X: nessuna richiesta
    assert not [t for t in tickets(client, master) if t["kind"] == "evoluzione"]
    p2 = login(client, "giocatore2")
    body = {"field": "skills", "name": "Ispeziona Oggetto"}
    assert client.post("/api/characters/2/evoluzione", json=body, headers=p2).status_code == 403
    r = client.post("/api/characters/2/evoluzione", json=body, headers=master)
    assert r.status_code == 200 and len(r.json()["opened"]) == 2
    assert client.post("/api/characters/2/evoluzione", json=body, headers=master).status_code == 409
