"""Import delle schede Excel (file reali in radice al repo + un file sintetico per i casi limite)."""
import io
from pathlib import Path

import pytest
from openpyxl import Workbook

from conftest import login

ROOT = Path(__file__).resolve().parents[2]
MAIN = ROOT / "Scheda_Personaggio_STATISFY.xlsx"
KELVIN = ROOT / "Scheda_Personaggio_STATISFY_Kelvin.xlsx"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

pytestmark = pytest.mark.skipif(not (MAIN.exists() and KELVIN.exists()), reason="file Excel non presenti")


def upload(client, h, path=None, content=None, name=None, **form):
    data = {k: (str(v).lower() if isinstance(v, bool) else v) for k, v in form.items()}
    body = content if content is not None else path.read_bytes()
    return client.post("/api/import/excel", headers=h, data=data,
                       files={"file": (name or (path.name if path else "x.xlsx"), body, XLSX)})


def char(client, h, name):
    cid = next(c["id"] for c in client.get("/api/characters", headers=h).json() if c["name"] == name)
    return client.get(f"/api/characters/{cid}", headers=h).json()


def msgs(res, who, severity=None):
    return [i["message"] for i in res["issues"]
            if i["character"] == who and (severity is None or i["severity"] == severity)]


def test_import_main_file(client, master):
    r = upload(client, master, MAIN)
    assert r.status_code == 200, r.text
    res = r.json()
    assert [(c["name"], c["action"]) for c in res["characters"]] == [
        ("Eric", "updated"), ("Corax", "updated"), ("Deniel", "updated"), ("Connor", "updated"), ("Dante", "updated")]
    assert res["summary"]["bad"] == 0

    # Corax: 185 punti Level Up al livello 181 → segnalato, NON corretto
    corax_warn = msgs(res, "Corax", "warn")
    assert any("185" in m and "attesi 180" in m for m in corax_warn)
    assert any(m.startswith("CHA: «Punti Titoli» vale 0") and "150" in m for m in corax_warn)
    c = char(client, master, "Corax")
    assert c["level"] == 181 and c["classe"] == "Monaco"
    assert [s["code"] for s in c["stats"]] == ["STR", "DEX", "VIT", "INT", "SHA", "KI", "CHA"]
    assert all(s["levelup"] == 185 for s in c["stats"] if s["kind"] == "base")
    assert c["totals"] == {"STR": 523, "DEX": 740, "VIT": 505, "INT": 728, "SHA": 713, "KI": 729, "CHA": 248}
    assert len(c["titles"]) == 12
    t = next(t for t in c["titles"] if t["name"] == "Il Primo Agente dei Nocturn")
    assert t == {"name": "Il Primo Agente dei Nocturn", "rarity": "Unico",
                 "bonus": {"VIT": -20, "INT": 15, "SHA": 30, "CHA": 20}}
    assert c["free_points"] == {"total": 1800, "used": 1680, "left": 120}
    # derivate ricalcolate dalle regole dell'app, non lette dall'Excel
    d = {x["key"]: x for x in c["derived"]}
    assert d["hp"]["value"] == 100 + 505 * 15 and d["moltFis"]["value"] == 6.23

    # Eric: colonna extra sommata in Altro e segnalata; WIS con troppi level up
    assert any("Imprese Diplomatiche" in m for m in msgs(res, "Eric", "warn"))
    assert any(m.startswith("WIS (avanzata)") for m in msgs(res, "Eric", "warn"))
    e = char(client, master, "Eric")
    assert e["level"] == 110 and e["totals"]["INT"] == 1493 and e["stats"][3]["altro"] == 81
    assert "Imprese Diplomatiche" in e["stats"][0]["note"]
    assert "placeholder" not in [t["name"] for t in e["titles"]]

    # Deniel: talenti al posto dei titoli; level up 110 al livello 110
    assert any("110" in m and "attesi 109" in m for m in msgs(res, "Deniel", "warn"))
    assert char(client, master, "Deniel")["talents"][0]["name"] == "Rabbia del Berserker"
    # Connor: coefficiente VITA 20 invece di 15; il seed ha già la classe dell'Excel (Guerriero), nessun cambio
    assert any("VITA = 20" in m for m in msgs(res, "Connor", "warn"))
    assert not any(m.startswith("Classe: nel database") for m in msgs(res, "Connor", "info"))
    assert msgs(res, "Dante", "warn") == []

    # una questione per personaggio con incoerenze, visibile al Master
    titles = {i["title"]: i for i in client.get("/api/issues", headers=master).json()}
    assert {"Import Excel — Eric", "Import Excel — Corax", "Import Excel — Deniel",
            "Import Excel — Connor"} <= set(titles)
    assert "Import Excel — Dante" not in titles
    assert "185" in titles["Import Excel — Corax"]["text"]
    # reimportare aggiorna le questioni aperte invece di duplicarle
    n = len(titles)
    upload(client, master, MAIN)
    assert len(client.get("/api/issues", headers=master).json()) == n


def test_import_kelvin_file(client, master, p1):
    res = upload(client, master, KELVIN).json()
    assert res["characters"][0]["sections"] == {"titles": 3, "skills": 36, "active_skills": 2, "talents": 16,
                                                "inventory": 40, "pets": 2, "curses": 1, "quests": 2}
    assert any("Colossus Slayer, Finesse V" in m for m in msgs(res, "Kelvin", "warn"))
    k = char(client, p1, "Kelvin")  # il proprietario resta giocatore1
    assert k["owner_name"] == "Giocatore 1"
    fin = next(s for s in k["stats"] if s["code"] == "FIN")
    assert fin["altro"] == 354 and fin["total"] == 649 and "1.2" in fin["note"]
    assert k["item_bonus"] == {"evasione": 10}
    assert (k["corone"], k["scellini"]) == (25, 30)
    assert k["skills"][1] == {"name": "Cooking", "lvl": 10, "pct": "MAX", "type": "Craft",
                              "passive": "Gli effetti di tutti i consumabili che vengono ingeriti raddoppiano"}
    assert k["pets"][0]["skills"][1] == {"name": "Scavenging", "lvl": 7, "pct": 50}
    assert k["curses"][0]["name"] == "Braccio degli antichi"
    assert k["inventory"][6]["rarity"] == "Epico" and k["inventory"][0]["rarity"] == "Comune"  # rarità vuota: l'inventario normalizzato usa Comune
    assert k["combat"]["position"] == "Media distanza"  # campi non presenti nell'Excel restano invariati


def test_dry_run_changes_nothing(client, master):
    before = char(client, master, "Eric")
    n_issues = len(client.get("/api/issues", headers=master).json())
    res = upload(client, master, MAIN, dry_run=True).json()
    assert res["dry_run"] is True and res["issue_ids"] == []
    assert any("185" in m for m in msgs(res, "Corax", "warn"))
    assert char(client, master, "Eric") == before
    assert len(client.get("/api/issues", headers=master).json()) == n_issues


def test_import_permissions_and_bad_files(client, master, p1):
    assert upload(client, p1, MAIN).status_code == 403
    assert client.post("/api/import/excel", files={"file": ("a.xlsx", b"x", XLSX)}).status_code == 401
    r = upload(client, master, content=b"non sono un excel", name="schede.xlsx")
    assert r.status_code == 422 and "xlsx" in r.json()["detail"]
    assert upload(client, master, content=b"a,b", name="schede.csv").status_code == 422
    r = upload(client, master, MAIN, owners="[1]")
    assert r.status_code == 422
    r = upload(client, master, MAIN, owners='{"Eric": "nessuno"}')
    assert r.status_code == 422 and "nessuno" in r.json()["detail"]


def synthetic(name="Brann", level=3, levelup=2):
    """Scheda minima nello stesso layout; scritta da openpyxl, quindi le formule non hanno valori salvati."""
    wb = Workbook()
    ws = wb.active
    ws.title = name
    ws["A4"], ws["B4"], ws["C4"], ws["D4"] = "Nome Personaggio:", name, "Classe:", "Bardo"
    ws["A5"], ws["B5"], ws["C5"], ws["D5"] = "Livello Attuale:", level, "EXP Corrente:", 40
    heads = ["Statistica", "Valore", "Valore Iniziale", "Punti Creazione", "Punti Investiti", "Punti Level Up",
             "Punti Altro", "Punti Titoli"]
    for i, h in enumerate(heads, start=1):
        ws.cell(row=8, column=i, value=h)
    rows = [("Forza (STR)", 5), ("Destrezza (DEX)", 5), ("Vitalità (VIT)", 5), ("Intelligenza (INT)", 5)]
    for r, (label, cr) in enumerate(rows, start=9):
        ws.cell(row=r, column=1, value=label)
        for c, v in zip(range(3, 9), [10, cr, 5, levelup, 0, 0]):
            ws.cell(row=r, column=c, value=v)
    ws["B9"] = "=SUM(C9:H9)"  # nessun valore calcolato salvato
    ws["G10"] = "=1+1"
    ws["A13"] = "Statistica 1"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_import_new_character(client, master):
    r = upload(client, master, content=synthetic(), name="brann.xlsx", owners='{"brann": "giocatore2"}')
    res = r.json()
    assert res["characters"][0]["action"] == "created" and res["characters"][0]["owner"] == "giocatore2"
    assert any("G10" in m and "senza valore calcolato" in m for m in msgs(res, "Brann", "warn"))
    assert not any("Livello" in m and "attesi" in m for m in msgs(res, "Brann", "warn"))
    p2 = login(client, "giocatore2")
    b = char(client, p2, "Brann")
    assert (b["level"], b["exp_pct"], b["classe"], b["regno"]) == (3, 40, "Bardo", "—")
    assert b["totals"] == {"STR": 22, "DEX": 22, "VIT": 22, "INT": 22}  # G10 (=1+1) senza valore → 0
    assert b["resources"] == {"hp": 100 + 22 * 15, "mp": 50 + 22 * 10, "sp": 50 + 44 * 5}
    assert b["free_points"] == {"total": 20, "used": 20, "left": 0}


def test_import_wrong_level_up_not_corrected(client, master):
    res = upload(client, master, content=synthetic(levelup=7), name="b.xlsx").json()
    assert any("= 7 su STR, DEX, VIT, INT, attesi 2" in m for m in msgs(res, "Brann", "warn"))
    b = char(client, master, "Brann")
    assert all(s["levelup"] == 7 for s in b["stats"])
    assert b["owner_name"] == "Il Narratore"
