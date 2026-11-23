"""Sezione PNG: preset componibili, schede, comparse, controlli e prove sui PNG già scritti."""
import shutil

import pytest

from app import rules as R
from app.png import controlla as K
from app.png import dati as D
from app.png import genera as G
from app.png.componi import componi, frequenze, leggi_ritocchi

ALBA = {"zona": "alba-chiara"}


# ---------- preset e controlli ----------
def test_preset_senza_errori_e_prove_ok():
    r = K.controlla()
    assert r["errori"] == []
    assert r["prove"] and r["prove_ok"], [p for p in r["prove"] if not p["ok"]]
    assert any(a["genere"] == "proposta" for a in r["avvisi"])
    assert any(a["genere"] == "null" for a in r["avvisi"])


def test_controllo_trova_refusi_e_derivati(tmp_path, monkeypatch):
    copia = tmp_path / "png"
    shutil.copytree(D.RADICE, copia)
    f = copia / "preset" / "ruoli" / "fabbro.yaml"
    f.write_text(f.read_text(encoding="utf-8").replace("corporatura: robusta", "corporatra: robusta")
                 + "Vita: 300\nno_tipici: {aggiungi: [non gli va]}\n", encoding="utf-8")
    g = copia / "preset" / "ruoli" / "guardia.yaml"
    g.write_text(g.read_text(encoding="utf-8").replace("villaggio: [20, 45]               # FONTE Zona_Alba_Chiara, «Tipi di PNG generici» e «Legge in vigore»",
                                                       "villaggio: [20, 145]"), encoding="utf-8")
    monkeypatch.setattr(D, "RADICE", copia)
    testi = [x["testo"] for x in K.controlla_preset(D.catalogo()).errori]
    assert any("corporatra" in t and "forse «corporatura»" in t for t in testi)
    assert any("«Vita» è un valore derivato" in t for t in testi)
    assert any("non gli va" in t and "Taratura §5" in t for t in testi)
    assert any("oltre il 99 senza una FONTE" in t for t in testi)


# ---------- composizione ----------
def test_componi_dice_da_dove_viene_ogni_valore():
    c = componi("fabbro", "adulto", "nano", {"regno": "frostland", "insediamento": "citta"})
    assert c.campi["corporatura"]["valore"] == "robusta" and c.campi["corporatura"]["da"] == "ruolo fabbro"
    assert c.campi["profilo.VIT"]["da"] == "razza nano"
    assert c.campi["mestiere.grado"]["valore"] == ["VII", "X"] and "variante nano" in c.campi["mestiere.grado"]["da"]
    assert c.campi["livello"]["valore"] == [40, 99]
    assert c.campi["livello"]["dove"].startswith("preset/ruoli/fabbro.yaml:")
    assert "PROPOSTA" in c.campi["livello"]["nota"]
    assert any("longevità" in a for a in c.avvisi)
    assert sum(c.atteggiamento["frequenze"].values()) == 100


def test_bambino_segue_gli_anni_e_non_ha_mestiere():
    c = componi("cittadino", "bambino", "umano", {"regno": "valeria", "insediamento": "citta"})
    # fascia di città 15-45 e fascia degli anni 3-12 non si toccano: vince la più bassa
    assert c.campi["livello"]["valore"] == [3, 12]
    assert c.valore("mestiere.nome") is None and c.valore("addestramento") == "nessuno"
    # una variante di razza non ridà un mestiere a un bambino
    c = componi("cittadino", "bambino", "elementale_minore", {"regno": "qadesh", "insediamento": "citta"})
    assert c.valore("mestiere.nome") is None


def test_goblin_dentro_le_mura_chiede_un_motivo():
    c = componi("cittadino", "adulto", "goblin", ALBA)
    assert c.errori and "motivo" in c.errori[0]
    c = componi("cittadino", "adulto", "goblin", ALBA, ["porta i conti di Tek al mercante"])
    assert not c.errori


def test_razza_rara_avvisa():
    c = componi("cittadino", "anziano", "elfo", ALBA)
    assert any("rara nel luogo" in a for a in c.avvisi)


def test_ritocchi():
    r = leggi_ritocchi(["ex soldato", "livello 61", "anni 40", "STR alta", "grado VII", "corporatura robusta"])
    assert r["motivi"] == ["ex soldato"] and r["livello"] == [61, 61] and r["anni"] == 40
    assert r["profilo"] == {"STR": "alta"} and r["grado"] == "VII" and r["corporatura"] == "robusta"
    c = componi("guardia", "adulto", "umano", ALBA, ["livello 72", "capo delle guardie"])
    assert c.valore("livello") == [72, 72] and any("fuori dalla fascia" in a for a in c.avvisi)


def test_frequenze_con_tetto():
    f = frequenze({"ostile": 10, "diffidente": 90, "indifferente": 35, "interessato": 20, "ben_disposto": 5}, 50, [])
    assert sum(f.values()) == 100 and max(f.values()) <= 50


# ---------- nuovo, comparse, numeri ----------
def test_nuovo_e_riproducibile_e_rispetta_le_regole():
    a = G.nuovo("fabbro", "adulto", "umano", ALBA, ["ex soldato della Corona"], seme=11)
    b = G.nuovo("fabbro", "adulto", "umano", ALBA, ["ex soldato della Corona"], seme=11)
    assert a["scheda"] == b["scheda"]
    s = a["scheda"]
    assert 30 <= s["livello"] <= 65 and s["provenienza"]["seme"] == 11
    assert s["id"].startswith("alba-chiara/") and s["contraddizione"] is None and "contraddizione" in s["da_ritoccare"]
    assert not any(k in s for k in ("Vita", "danno", "hp"))
    assert s["nome"].split()[0] not in {"Bram", "Marta", "Elena", "Nessa"}
    for seme in range(1, 40):   # senza motivo: due terzi bassi e mai sopra gli anni
        x = G.nuovo("cittadino", "adulto", "umano", ALBA, seme=seme)["scheda"]
        assert 3 <= x["livello"] <= 24 and x["livello"] <= x["eta"]["apparente"]


def test_ogni_eta_ha_un_difetto():
    for eta in ("bambino", "ragazzo", "adulto", "anziano"):
        s = G.nuovo("cittadino", eta, "umano", ALBA, seme=21)["scheda"]
        assert s["difetto"] and s["vuole"] and s["teme"]


def test_nuovo_bambino_e_elfo():
    s = G.nuovo("cittadino", "bambino", "umano", ALBA, seme=3)["scheda"]
    assert s["mestiere"] is None and s["livello"] <= s["eta"]["apparente"]
    assert G.combattimento(s)["combatte"] is False
    out = G.nuovo("cittadino", "anziano", "elfo", ALBA, seme=5)
    s = out["scheda"]
    assert s["eta"]["vera"] == s["eta"]["apparente"] * 5 and "perche_qui" in s["da_ritoccare"]
    assert s["nome"] == "[nome da scegliere]"


def test_comparse_varie():
    out = G.comparse(ALBA, 8, seme=42)
    righe = out["comparse"]
    assert len(righe) == 8
    assert sum(r["atteggiamento"] == "ben_disposto" for r in righe) <= 1
    assert len({r["nome"] for r in righe}) == 8


def test_combattimento_usa_le_formule_di_combat():
    s = G.nuovo("fabbro", "adulto", "umano", ALBA, ["livello 61", "ex soldato"], seme=1)["scheda"]
    b = G.combattimento(s)
    k = R.creature(61, "Comune", "Robusta")
    assert b["vita"] == k["hp"] == (40 + 61 * 20) * 1.5
    assert b["danno"] == k["dmg"] * 0.5   # improvvisato
    s2 = G.nuovo("cittadino", "adulto", "umano", ALBA, seme=1)["scheda"]
    assert G.combattimento(s2)["combatte"] is False


def test_promuovi_e_aggiorna():
    c = G.comparse(ALBA, 1, ["contadino"], seme=9)["comparse"][0]
    s = G.promuovi(c)["scheda"]
    assert s["dettaglio"] == "scheda" and s["nome"] == c["nome"] and s["livello"] == c["livello"]
    s = G.promuovi(s)["scheda"]
    assert s["dettaglio"] == "completa" and "background" in s["completa"]
    out = G.aggiorna(s, "1", {"giorno": 1, "affinita": 1, "motivo": "aiuto col carro"})
    out = G.aggiorna(out["scheda"], "1", {"giorno": 1, "affinita": 1, "motivo": "ancora"})
    assert any("stesso giorno" in a for a in out["avvisi"])
    out = G.aggiorna(out["scheda"], "1", {"giorno": 2, "affinita": -1, "motivo": "furto"})
    st = out["scheda"]["stato"]["1"]
    assert st["affinita"] == -1 + 1 + 1 - 2   # la perdita vale doppio
    out = G.aggiorna(out["scheda"], "1", {"giorno": 3, "morto": "lupi"})
    assert out["scheda"]["stato"]["1"]["vivo"] is False and out["scheda"]["nome"]


def test_riga_di_zona():
    s = G.nuovo("fabbro", "adulto", "umano", ALBA, ["ex soldato"], seme=2)["scheda"]
    r = G.riga_zona(s)
    assert r["markdown"].startswith(f"| {s['nome']} | {s['livello']} | fabbro |")


def test_da_bozza_scritto_a_mano_vince():
    d = {"ruolo": "fabbro", "zona": "alba-chiara", "ritocchi": ["ex soldato"], "seme": 8, "nome": "Gilda Fornari",
         "livello": 50, "campi": {"vuole": "finire la grata del mulino", "contraddizione": "burbera, ma canta"}}
    out = G.da_bozza(d)
    s = out["scheda"]
    assert s["nome"] == "Gilda Fornari" and s["livello"] == 50 and s["id"] == "alba-chiara/gilda-fornari"
    assert s["vuole"] == "finire la grata del mulino" and s["origine"]["vuole"] == "scritto a mano"
    assert "vuole" not in s["da_ritoccare"] and "contraddizione" not in s["da_ritoccare"]
    assert out["combattimento"]["vita"] == (40 + 50 * 20) * 1.5
    # stesso seme, stessa pescata per ciò che non è scritto a mano
    assert G.da_bozza({**d, "campi": {}})["scheda"]["teme"] == s["teme"]
    c = G.da_bozza({**d, "completa": True, "storia": {"origine": "nata a Lumengarde"}})["scheda"]
    assert c["dettaglio"] == "completa" and c["completa"]["background"]["origine"] == "nata a Lumengarde"


def test_wizard_forgia_usa_il_motore_dei_preset(client, master):
    bozza = {"ruolo": "fabbro", "eta": "adulto", "razza": "umano", "zona": "alba-chiara", "ritocchi": ["ex soldato"],
             "seme": 8, "nome": "", "livello": "", "campi": {}, "storia": {}, "knows": "Niente", "debts": ""}
    pv = client.post("/api/forge/preview", headers=master, json={"kind": "npcs", "draft": bozza}).json()
    assert pv["first_bad"] == 2 and "contraddizione" in pv["steps"][2]
    assert pv["computed"]["scheda"]["ruolo"] == "fabbro" and pv["computed"]["combattimento"]["combatte"]
    bozza["campi"] = {"contraddizione": "burbero, ma piange ai funerali"}
    r = client.post("/api/forge/entries", headers=master, json={"kind": "npcs", "draft": bozza})
    assert r.status_code == 201, r.text
    nid = r.json()["entry"]["npc_id"]
    n = next(x for x in client.get("/api/npcs", headers=master).json() if x["id"] == nid)
    assert n["dettaglio"] == "completa" and n["scheda"]["provenienza"]["seme"] == 8 and n["knows"] == "Niente"
    assert client.get(f"/api/png/schede/{nid}/combattimento", headers=master).json()["combatte"]
    goblin = {**bozza, "razza": "goblin", "ritocchi": []}   # senza motivo la variante dice di no
    pv = client.post("/api/forge/preview", headers=master, json={"kind": "npcs", "draft": goblin}).json()
    assert pv["first_bad"] == 0 and "motivo" in pv["steps"][0]


def test_ritratto(client, master):
    r = client.post("/api/png/nuovo", headers=master, json={"ruolo": "cittadino", "zona": "alba-chiara", "seme": 3, "salva": True,
                                                           "ritratto": {"immagini": [{"id": "a", "src": "data:image/jpeg;base64,AAAA"}]}}).json()
    nid = r["npc"]["id"]
    rit = r["npc"]["scheda"]["ritratto"]
    assert rit["immagini"][0]["principale"] and rit["descrizione"]
    bad = {"campi": {"ritratto": {"immagini": [{"src": "javascript:alert(1)"}]}}}
    assert client.patch(f"/api/png/schede/{nid}", headers=master, json=bad).status_code == 422
    troppe = {"campi": {"ritratto": {"immagini": [{"src": "data:image/png;base64,AA=="}] * 7}}}
    assert client.patch(f"/api/png/schede/{nid}", headers=master, json=troppe).status_code == 422


# ---------- API ----------
def test_api_solo_master(client, p1):
    assert client.get("/api/png/catalogo", headers=p1).status_code == 403


def test_api_flusso(client, master):
    cat = client.get("/api/png/catalogo", headers=master).json()
    assert {"fabbro", "cittadino"} <= {r["nome"] for r in cat["ruoli"]}
    v = client.post("/api/png/componi", headers=master, json={"ruolo": "fabbro", "zona": "alba-chiara"}).json()
    assert v["campi"]["livello"]["valore"] == [30, 65]
    assert client.post("/api/png/componi", headers=master, json={"ruolo": "fabro"}).status_code == 422
    r = client.post("/api/png/nuovo", headers=master, json={"ruolo": "cittadino", "razza": "goblin", "zona": "alba-chiara"})
    assert r.status_code == 422 and "motivo" in str(r.json())
    r = client.post("/api/png/nuovo", headers=master,
                    json={"ruolo": "fabbro", "zona": "alba-chiara", "ritocchi": ["ex soldato"], "seme": 4, "salva": True}).json()
    npc = r["npc"]
    assert npc["dettaglio"] == "scheda" and npc["scheda"]["livello"] == npc["level"]
    assert "nome" not in r["npc"]["scheda"] or r["npc"]["scheda"]["nome"] == npc["name"]
    nid = npc["id"]
    assert any(n["id"] == nid for n in client.get("/api/npcs", headers=master).json())
    b = client.get(f"/api/png/schede/{nid}/combattimento", headers=master).json()
    assert b["combatte"] and b["vita"] == (40 + npc["level"] * 20) * 1.5
    p = client.patch(f"/api/png/schede/{nid}", headers=master,
                     json={"campi": {"contraddizione": "burbero, ma piange ai funerali"}}).json()
    assert p["npc"]["scheda"]["contraddizione"].startswith("burbero")
    assert client.patch(f"/api/png/schede/{nid}", headers=master, json={"campi": {"Vita": 999}}).status_code == 422
    a = client.post(f"/api/png/schede/{nid}/aggiorna", headers=master, json={"giorno": 1, "affinita": 1}).json()
    assert list(a["npc"]["scheda"]["stato"].values())[0]["affinita"] == 0
    assert client.post(f"/api/png/schede/{nid}/promuovi", headers=master).json()["npc"]["dettaglio"] == "completa"
    assert client.get(f"/api/png/schede/{nid}/riga", headers=master).json()["markdown"].startswith("|")
    c = client.post("/api/png/comparse", headers=master, json={"zona": "alba-chiara", "quante": 3, "salva": True}).json()
    assert len(c["npc"]) == 3 and all(n["dettaglio"] == "comparsa" for n in c["npc"])
    k = client.get("/api/png/controlla", headers=master).json()
    assert k["errori"] == [] and k["prove_ok"]
    # i PNG scritti a mano non hanno scheda dai preset
    old = client.get("/api/npcs", headers=master).json()[0]
    assert old["scheda"] is None
    assert client.get(f"/api/png/schede/{old['id']}/combattimento", headers=master).status_code == 409


# ---------- regressioni dagli attacchi (agente malintenzionato) ----------
def test_attacchi_nomi_vuoti_e_numeri_enormi(client, master):
    assert client.post("/api/npcs", headers=master, json={"name": "\t "}).status_code == 422
    nid = client.post("/api/png/nuovo", headers=master, json={"ruolo": "cittadino", "zona": "alba-chiara", "seme": 1, "salva": True}).json()["npc"]["id"]
    assert client.patch(f"/api/png/schede/{nid}", headers=master, json={"nome": "   "}).status_code == 422
    assert client.post("/api/png/nuovo", headers=master, json={"ruolo": "cittadino", "zona": "alba-chiara"}).status_code == 200
    for r in ["livello 9223372036854775807", "livello 50-1", "livello " + "9" * 5000, "anni 99999999999999999", "livello 0"]:
        out = client.post("/api/png/nuovo", headers=master, json={"ruolo": "guardia", "zona": "alba-chiara", "seme": 2, "ritocchi": [r]})
        assert out.status_code in (200, 422), (r, out.status_code)
        if out.status_code == 200:
            assert 1 <= out.json()["scheda"]["livello"] <= 999
    c = client.post("/api/png/componi", headers=master, json={"ruolo": "guardia", "zona": "alba-chiara", "ritocchi": ["livello 50-1"]}).json()
    assert c["campi"]["livello"]["valore"] == [1, 50]


def test_attacchi_campi_con_tipi_sbagliati(client, master):
    nid = client.post("/api/png/nuovo", headers=master, json={"ruolo": "fabbro", "zona": "alba-chiara", "seme": 3, "salva": True}).json()["npc"]["id"]
    for campi in [{"eta": "anziano"}, {"addestramento": ["a"]}, {"tratti": 123}, {"vuole": {"x": 1}}, {"corporatura": "titanica"},
                  {"profilo": "x"}, {"sa": "stringa"}, {"mestiere": {"nome": "", "grado": "XI"}}, {"ritratto": {"immagini": ["abc"]}}]:
        assert client.patch(f"/api/png/schede/{nid}", headers=master, json={"campi": campi}).status_code == 422, campi
    assert client.get(f"/api/png/schede/{nid}/combattimento", headers=master).status_code == 200
    assert client.get("/api/png/controlla", headers=master).status_code == 200
    ok = client.patch(f"/api/png/schede/{nid}", headers=master, json={"campi": {"tratti": ["burbero"], "eta": {"apparente": 50}}}).json()
    assert ok["npc"]["scheda"]["eta"]["fase"] == "adulto" and ok["npc"]["scheda"]["eta"]["apparente"] == 50


def test_attacchi_comparse_e_bozze_storte(client, master):
    c = client.post("/api/png/comparse", headers=master, json={"zona": "alba-chiara", "quante": 1, "salva": True}).json()["npc"][0]
    assert client.patch(f"/api/png/schede/{c['id']}", headers=master, json={"campi": {"vuole": "a"}}).status_code == 409
    r = client.patch(f"/api/png/schede/{c['id']}", headers=master, json={"livello": 5}).json()
    assert r["npc"]["level"] == 5 and r["npc"]["place"] == c["place"]
    for draft in [{"ruolo": "fabbro", "campi": "x"}, {"ruolo": "fabbro", "storia": ["a"]}, {"ruolo": "fabbro", "regno": ["valeria"]},
                  {"ruolo": "fabbro", "ritocchi": "ex soldato"}, {"ruolo": "fabbro", "ritocchi": ["livello 50-2"]}]:
        pv = client.post("/api/forge/preview", headers=master, json={"kind": "npcs", "draft": draft})
        assert pv.status_code == 200, (draft, pv.text)
        assert "Exceeds" not in pv.text and "randrange" not in pv.text


def test_attacchi_morto_e_limiti_di_aggiorna(client, master):
    nid = client.post("/api/png/nuovo", headers=master, json={"ruolo": "cittadino", "zona": "alba-chiara", "seme": 4, "salva": True}).json()["npc"]["id"]
    assert client.post(f"/api/png/schede/{nid}/aggiorna", headers=master, json={"giorno": 10**30}).status_code == 422
    assert client.post(f"/api/png/schede/{nid}/aggiorna", headers=master, json={"partita": "../x"}).status_code == 422
    client.post(f"/api/png/schede/{nid}/aggiorna", headers=master, json={"giorno": 1, "morto": "lupi"})
    r = client.post(f"/api/png/schede/{nid}/aggiorna", headers=master, json={"giorno": 2, "affinita": 1, "memoria": ["x"]}).json()
    st = list(r["npc"]["scheda"]["stato"].values())[0]
    assert st["vivo"] is False and not st["memoria"] and "morto" in r["avvisi"][0]


def test_attacchi_omonimi_hanno_id_diversi(client, master):
    b = {"ruolo": "cittadino", "zona": "alba-chiara", "seme": 5, "nome": "Gilda Fornari", "salva": True}
    a = client.post("/api/png/nuovo", headers=master, json=b).json()["npc"]["scheda"]["id"]
    c = client.post("/api/png/nuovo", headers=master, json=b).json()["npc"]["scheda"]["id"]
    assert a == "alba-chiara/gilda-fornari" and c == "alba-chiara/gilda-fornari-2"
