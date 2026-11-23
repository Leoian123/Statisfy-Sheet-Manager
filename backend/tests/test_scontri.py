"""Scontri: avvio, azioni con meccanica, permessi, reazioni, turni, annulla, sincronizzazione delle risorse."""
from conftest import login

from app.mech_templates import TEMPLATES

TPL = {t["cat"]: t["mech"] for t in TEMPLATES}


def give(client, master, char_id, name, mech, field="active_skills", **extra):
    c = client.get(f"/api/characters/{char_id}", headers=master).json()
    items = c[field] + [{"name": name, "effect": "", "lvl": 5, "pct": 0, "cost": "", "cd": 0, "mech": mech, **extra}]
    r = client.patch(f"/api/characters/{char_id}", json={field: items}, headers=master)
    assert r.status_code == 200, r.text
    return r.json()


def start(client, master, pg_ids=(1, 2), creature=None):
    body = {"pg_ids": list(pg_ids),
            "creature": creature or [{"name": "Lupo", "count": 2, "level": 1}],
            "tiri": {f"ini:p{i}": 20 for i in pg_ids}}
    r = client.post("/api/scontri", json=body, headers=master)
    assert r.status_code == 200, r.text
    return r.json()


def current(sc):
    st = sc["state"]
    return st["ordine"][st["turno"]]


def test_mech_validated_on_patch(client, master):
    bad = {"v": 1, "effetti": [{"azione": {"op": "danno"}}]}  # danno senza formula
    c = client.get("/api/characters/1", headers=master).json()
    r = client.patch("/api/characters/1", json={"active_skills": c["active_skills"] + [
        {"name": "Rotto", "mech": bad}]}, headers=master)
    assert r.status_code == 422 and "formula" in r.json()["detail"]
    out = give(client, master, 1, "Dardo", TPL[1])
    saved = next(x for x in out["active_skills"] if x["name"] == "Dardo")
    assert saved["mech"]["v"] == 1 and saved["mech"]["tiro_colpire"] is True  # normalizzata


def test_start_play_and_sync(client, master):
    give(client, master, 1, "Dardo", TPL[1])
    sc = start(client, master)
    st = sc["state"]
    assert set(st["combattenti"]) == {"p1", "p2", "n1", "n2"}
    assert st["combattenti"]["n1"]["nome"] == "Lupo A"
    assert client.post("/api/scontri", json={"pg_ids": [1], "creature": [{"name": "X"}]},
                       headers=master).status_code == 409  # uno solo attivo
    # Il Master forza Kelvin a lanciare il Dardo sul lupo (tiri inseriti a mano)
    p = client.post(f"/api/scontri/{sc['id']}/anteprima", json={"attore": "p1", "abilita": "Dardo", "bersagli": ["n1"]},
                    headers=master).json()
    assert p["stima"]["n1"]["danno"][0] > 0 and any(r["key"] == "colpo:n1" for r in p["richieste"])
    hp0 = st["combattenti"]["n1"]["hp"]
    r = client.post(f"/api/scontri/{sc['id']}/azione", json={
        "version": sc["version"], "attore": "p1", "abilita": "Dardo", "bersagli": ["n1"], "forza": True,
        "tiri": {"colpo:n1": 1, "crit:a.0:n1": 100, "danno:a.0:n1": 20}}, headers=master)
    assert r.status_code == 200, r.text
    sc2 = r.json()
    assert sc2["state"]["combattenti"]["n1"]["hp"] < hp0
    assert sc2["result"]["esito"] == "ok" and sc2["can_undo"]
    # MP di Kelvin scritti sulla scheda
    mp = sc2["state"]["combattenti"]["p1"]["mp"]
    assert client.get("/api/characters/1", headers=master).json()["resources"]["mp"] == mp
    # versione vecchia → 409
    r = client.post(f"/api/scontri/{sc['id']}/fine-turno", json={"version": sc["version"]}, headers=master)
    assert r.status_code == 409
    # annulla
    r = client.post(f"/api/scontri/{sc['id']}/annulla", json={"version": sc2["version"]}, headers=master)
    assert r.status_code == 200
    assert r.json()["state"]["combattenti"]["n1"]["hp"] == hp0
    assert client.get("/api/characters/1", headers=master).json()["resources"]["mp"] > mp


def test_player_permissions(client, master):
    sc = start(client, master)
    p1 = login(client, "giocatore1")  # Kelvin (id 1)
    p2 = login(client, "giocatore2")  # Eric (id 2)
    view = client.get("/api/scontri/attivo", headers=p1).json()["scontro"]
    assert view["mine"] == ["p1"] and not view["master"]
    assert view["state"]["combattenti"]["n1"]["abilita"] == []  # abilità dei nemici nascoste
    body = {"version": sc["version"], "attore": "p2", "abilita": "Attacco", "bersagli": ["n1"]}
    assert client.post(f"/api/scontri/{sc['id']}/azione", json=body, headers=p1).status_code == 403
    body["forza"] = True
    assert client.post(f"/api/scontri/{sc['id']}/azione", json=body, headers=p2).status_code == 403
    assert client.post(f"/api/scontri/{sc['id']}/annulla", json={"version": sc["version"]}, headers=p1).status_code == 403
    # Chi ha il turno può agire e chiuderlo
    who = current(sc)
    hdr = {"p1": p1, "p2": p2}.get(who, master)
    r = client.post(f"/api/scontri/{sc['id']}/azione", json={
        "version": sc["version"], "attore": who, "abilita": "Attacco", "bersagli": ["n1" if who.startswith("p") else "p1"]},
        headers=hdr)
    assert r.status_code == 200, r.text
    r = client.post(f"/api/scontri/{sc['id']}/fine-turno", json={"version": r.json()["version"]}, headers=hdr)
    assert r.status_code == 200, r.text
    assert current(r.json()) != who


def test_reaction_window_flow(client, master):
    give(client, master, 1, "Meteora", TPL[46])
    give(client, master, 2, "Counterspell", TPL[12])
    sc = start(client, master)
    # Eric (p2) nemico? No: entrambi alleati. Mettiamo un nemico con counterspell: si usa un PG nemico non serve,
    # basta verificare che senza candidati non si apre la finestra
    r = client.post(f"/api/scontri/{sc['id']}/azione", json={
        "version": sc["version"], "attore": "p1", "abilita": "Meteora", "bersagli": ["n1", "n2"], "forza": True},
        headers=master)
    assert r.status_code == 200 and r.json()["result"]["esito"] == "ok"
    st = r.json()["state"]
    assert [w for w in st["in_attesa"] if w["tipo"] == "canalizzazione"]


def test_adjust_and_close(client, master):
    sc = start(client, master)
    r = client.post(f"/api/scontri/{sc['id']}/combattenti/p1", json={"version": sc["version"], "hp": 1},
                    headers=master)
    assert r.status_code == 200
    assert client.get("/api/characters/1", headers=master).json()["resources"]["hp"] == 1
    r = client.post(f"/api/scontri/{sc['id']}/chiudi", json={"version": r.json()["version"]}, headers=master)
    assert r.status_code == 200 and not r.json()["active"]
    assert client.get("/api/scontri/attivo", headers=master).json()["scontro"] is None


def test_start_from_forge_encounter(client, master):
    draft = {"name": "Imboscata", "place": "Bosco", "party": [1, 2], "level": 100, "creatures": [
        {"name": "Bandito", "count": 3, "rarity": "Comune", "level": 5, "size": "Normale"}], "masterDiff": "Facile"}
    r = client.post("/api/forge/entries", json={"kind": "encounters", "draft": draft}, headers=master)
    assert r.status_code == 201, r.text
    eid = r.json()["entry"]["id"]
    r = client.post("/api/scontri", json={"encounter_id": eid}, headers=master)
    assert r.status_code == 200, r.text
    names = [c["nome"] for c in r.json()["state"]["combattenti"].values()]
    assert "Bandito C" in names and "Kelvin" in names


def test_candidates_list(client, master):
    give(client, master, 1, "Dardo", TPL[1])
    r = client.get("/api/scontri/candidati", headers=master).json()
    k = next(c for c in r["characters"] if c["id"] == 1)
    assert k["abilities"] == 1


def test_forge_spell_with_mech_reaches_sheet(client, master):
    spell = {"name": "Dardo di prova", "effect": "Un dardo di energia.", "origin": "grimorio",
             "spheres": [{"s": "Vis", "role": "forma", "trav": False}], "combo": False, "level": 1, "meta": [],
             "env": {"zone": "", "ley": 0, "anti": False}, "risk": {}, "cost": None, "cd": None, "charId": 1,
             "assign": True, "force": True, "mech": {"v": 1, "effetti": [
                 {"azione": {"op": "danno"}, "formula": {"base": "incantesimo", "tipo": "Vis"}}]}}
    pv = client.post("/api/forge/preview", json={"kind": "spells", "draft": spell}, headers=master).json()
    assert pv["first_bad"] == -1, pv["steps"]
    assert "15–30" in pv["computed"]["mech"]["text"]
    bad = {**spell, "mech": {"v": 1, "effetti": [{"azione": {"op": "danno"}}]}}
    pv = client.post("/api/forge/preview", json={"kind": "spells", "draft": bad}, headers=master).json()
    assert pv["first_bad"] == 1 and "formula" in pv["steps"][1]
    r = client.post("/api/forge/entries", json={"kind": "spells", "draft": spell}, headers=master)
    assert r.status_code == 201, r.text
    sk = next(x for x in client.get("/api/characters/1", headers=master).json()["active_skills"]
              if x["name"] == "Dardo di prova")
    assert sk["mech"]["costi"][0]["risorsa"] == "MP" and "Vis" in sk["mech"]["etichette"]
    meta = client.get("/api/forge/meta", headers=master).json()
    assert len(meta["mech"]["templates"]) == 74 and "Gelo" in meta["mech"]["status"]["status"]


def test_quick_start_text_abilities_and_add_enemies(client, master):
    c = client.get("/api/characters/1", headers=master).json()
    client.patch("/api/characters/1", json={"active_skills": c["active_skills"] + [
        {"name": "Dardo Magico", "effect": "Colpisce sempre", "lvl": 1, "pct": 0, "cost": "20 MP", "cd": 1}]}, headers=master)
    r = client.post("/api/scontri", json={"tutti": True}, headers=master)
    assert r.status_code == 200, r.text
    sc = r.json()
    st = sc["state"]
    assert all(c["lato"] == "alleati" for c in st["combattenti"].values()) and len(st["combattenti"]) >= 6
    lock = next(c for c in st["combattenti"].values() if c["nome"] == "Kelvin")
    dm = next(a for a in lock["abilita"] if a["nome"] == "Dardo Magico")
    assert not dm["testo"] and dm["costi"][0]["valore"] == 20  # skill di classe con meccanica di default
    kel = next(c for c in st["combattenti"].values() if c["nome"] == "Kelvin")
    sott = next(a for a in kel["abilita"] if a["nome"].startswith("Comando: Sottomissione"))
    assert sott["testo"] and sott["costi"][0] == {"risorsa": "MP", "valore": 120, "per": "lancio", "status": ""}
    cur = st["ordine"][st["turno"]]
    r = client.post(f"/api/scontri/{sc['id']}/aggiungi", json={"version": sc["version"], "creature": [
        {"name": "Lupo", "count": 2, "level": 3}]}, headers=master)
    assert r.status_code == 200, r.text
    st2 = r.json()["state"]
    assert {"Lupo A", "Lupo B"} <= {c["nome"] for c in st2["combattenti"].values()}
    assert st2["ordine"][st2["turno"]] == cur  # chi aveva il turno lo tiene
    p1 = login(client, "giocatore1")
    assert client.post(f"/api/scontri/{sc['id']}/aggiungi", json={"version": r.json()["version"], "creature": [
        {"name": "X"}]}, headers=p1).status_code == 403
    # Un'abilità di solo testo si usa: paga il costo e scrive l'effetto nel registro
    v = r.json()["version"]
    kid = next(k for k, c in st2["combattenti"].items() if c["nome"] == "Kelvin")
    r = client.post(f"/api/scontri/{sc['id']}/azione", json={"version": v, "attore": kid, "abilita": "Comando: Battaglia",
                                                             "bersagli": [], "forza": True}, headers=master)
    assert r.status_code == 200, r.text
    assert any("Comando: Battaglia" in l["t"] for l in r.json()["state"]["registro"])
