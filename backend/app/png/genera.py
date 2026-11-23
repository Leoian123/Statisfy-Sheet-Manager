"""Dalle composizioni alle persone: scheda semplificata, comparsa, blocco di combattimento, promozione,
aggiornamento dopo una sessione, riga per la tabella di una scheda di zona.

Le schede conservano gli ingressi (livello, corporatura, addestramento, profilo), mai i risultati: Vita e danno si
calcolano qui, quando servono, con le formule di `app.rules` (Combat.txt per le creature, Progressione per i PG).
"""
from __future__ import annotations

import math
import random
from copy import deepcopy
from typing import Any

from .. import rules as R
from . import dati as D
from .componi import Composizione, componi, fascia_da_anni, interseca, vista

CAMPI_ROSA = ["vuole", "teme", "difetto", "forestieri", "prezzo", "vita"]


# ---------------------------------------------------------------------------------------------------------------
# Pescate
# ---------------------------------------------------------------------------------------------------------------
def _pesca(rng: random.Random, voci: list[dict], evita: set[str] = frozenset()) -> dict | None:
    if not voci:
        return None
    libere = [v for v in voci if v["voce"] not in evita] or voci
    return rng.choice(libere)


def _pesa(rng: random.Random, frequenze: dict, escludi: set[str] = frozenset()) -> str:
    voci = [(k, v) for k, v in frequenze.items() if k not in escludi and v > 0] or list(frequenze.items())
    tot = sum(v for _, v in voci)
    x = rng.uniform(0, tot)
    for k, v in voci:
        x -= v
        if x <= 0:
            return k
    return voci[-1][0]


def nome_per(cat: D.Catalogo, razza: str, regno: str, genere: str, rng: random.Random, usati: set[str]) -> str | None:
    """Nome nello stile della razza (se ne ha uno) o del regno. None se i documenti non danno uno stile."""
    zn = (cat.razze[razza].dati or {}).get("nomi")
    if isinstance(zn, dict):
        stile = zn
    elif zn == "dal regno":
        stile = ((cat.regni.dati or {}).get(regno) or {}).get("nomi")
    else:
        stile = None
    if not isinstance(stile, dict):
        return None
    usati_l = {u.lower() for u in usati} | {u.split()[0].lower() for u in usati if u}
    usati_l |= {u.lower() for u in (stile.get("usati") or [])}
    nomi = [n for n in (stile.get(genere) or []) if n.lower() not in usati_l] or list(stile.get(genere) or [])
    if not nomi:
        return None
    cognomi = stile.get("cognomi") or []
    for _ in range(20):
        n = rng.choice(nomi)
        if cognomi and rng.random() < 0.75:
            n = f"{n} {rng.choice(cognomi)}"
        if n.lower() not in usati_l:
            return n
    return n


def usati_della_zona(cat: D.Catalogo, zona: str | None) -> set[str]:
    out: set[str] = set()
    for z, d in (cat.zone.dati or {}).items():
        if zona is None or z == zona:
            out |= set((d or {}).get("nomi_usati") or [])
    return out


# ---------------------------------------------------------------------------------------------------------------
# Anni e livello
# ---------------------------------------------------------------------------------------------------------------
def _anni_e_livello(c: Composizione, rng: random.Random) -> tuple[int, int, dict]:
    regole = c.cat.regole.dati.get("livello") or {}
    motivi = c.ritocchi["motivi"]
    anni_f = c.valore("anni")
    fascia = c.valore("livello")
    da_anni = c.valore("livello_da_anni")
    origine = {"livello": c.campi["livello"]["da"], "anni": c.campi["anni"]["da"]}
    if "livello" in c.ritocchi:
        lv = rng.randint(*c.ritocchi["livello"])
        anni = c.valore("anni")[0] if "anni" in c.ritocchi else None
        if anni is None:
            lo = max(anni_f[0], lv if c.strati["eta"] == "adulto" else anni_f[0])
            anni = rng.randint(min(lo, anni_f[1]), anni_f[1])
        return anni, lv, origine
    # età prima: per un adulto il livello di rado supera gli anni, quindi gli anni partono dal minimo della fascia
    lo_a, hi_a = anni_f
    if c.strati["eta"] == "adulto" and fascia and not motivi:
        lo_a = min(hi_a, max(lo_a, fascia[0]))
    anni = rng.randint(lo_a, hi_a)
    if da_anni:
        fascia, _ = interseca(fascia, fascia_da_anni([anni, anni], da_anni))
    lo, hi = fascia
    alto = hi
    if regole.get("terzo_alto_vuole_motivo", True) and not motivi:
        alto = max(lo, math.floor(lo + (hi - lo) * 2 / 3))
    if c.strati["eta"] == "adulto" and not motivi:
        alto = max(lo, min(alto, anni))
    lv = rng.randint(lo, alto)
    return anni, lv, origine


def terzo_alto(fascia: list, livello: int) -> bool:
    lo, hi = fascia
    return livello > lo + (hi - lo) * 2 / 3


# ---------------------------------------------------------------------------------------------------------------
# Nuovo PNG
# ---------------------------------------------------------------------------------------------------------------
def nuovo(ruolo: str, eta: str, razza: str, luogo: dict, ritocchi=None, seme: int | None = None,
          usati: set[str] | None = None, evita: dict | None = None, cat: D.Catalogo | None = None) -> dict:
    """Compone, pesca, compila una scheda semplificata. Non salva niente: lo fa chi chiama.
    `evita` = {"difetto": {...}, "intercalare": {...}} per non ripetere voce e difetto nella stessa scena."""
    cat = cat or D.catalogo()
    c = componi(ruolo, eta, razza, luogo, ritocchi, cat)
    if c.errori:
        return {"scheda": None, "errori": c.errori, "avvisi": c.avvisi, "composizione": vista(c)}
    seme = seme if seme is not None else random.SystemRandom().randrange(1, 2**31)
    rng = random.Random(seme)
    evita = evita or {}
    r = c.ritocchi
    origine: dict[str, str] = {}

    genere = r.get("genere") or rng.choice(["m", "f"])
    origine["genere"] = "ritocco" if r.get("genere") else "pescato"
    anni, livello, o = _anni_e_livello(c, rng)
    origine.update(o)
    if "livello" in r:
        origine["livello"] = "ritocco"

    usati = set(usati or set()) | usati_della_zona(cat, c.strati.get("zona"))
    nome = r.get("nome") or nome_per(cat, razza, c.strati["regno"], genere, rng, usati)
    origine["nome"] = "ritocco" if r.get("nome") else f"stile dei nomi ({'razza ' + razza if razza != 'umano' else 'regno ' + c.strati['regno']})"
    avvisi = list(c.avvisi)
    if not nome:
        nome = "[nome da scegliere]"
        avvisi.append(f"nessuno stile di nomi scritto per {razza} a {c.strati['regno']}: il nome va scelto a mano")
        origine["nome"] = "manca"

    pescate = {}
    for k in CAMPI_ROSA:
        v = _pesca(rng, c.elenchi.get(k) or [], evita.get(k, set()))
        pescate[k] = v["voce"] if v else None
        origine[k] = f"pescato da {v['da']}" if v else "rosa vuota"
    tratti_voci = [x for x in (c.elenchi.get("tratti") or []) if x["voce"] != pescate["difetto"]]
    t = _pesca(rng, tratti_voci)
    tratti = [x for x in (pescate["difetto"], t["voce"] if t else None) if x]
    origine["tratti"] = "difetto pescato + " + (t["da"] if t else "nessun tratto")
    inter = _pesca(rng, c.elenchi.get("intercalare") or [], evita.get("intercalare", set()))
    registro = c.valore("voce") or ""
    voce = registro + (f"; dice spesso {inter['voce']}" if inter else "")
    origine["voce"] = c.campi["voce"]["da"] if "voce" in c.campi else "—"
    if inter:
        origine["voce"] += f" + intercalare da {inter['da']}"

    ricchezza = c.valore("ricchezza") or "modesto"
    if isinstance(ricchezza, list):
        ricchezza = rng.choice(ricchezza)
    grado = c.valore("mestiere.grado")
    mestiere = None
    if c.valore("mestiere.nome"):
        if grado:
            i0, i1 = D.GRADI.index(grado[0]), D.GRADI.index(grado[1])
            grado_p = D.GRADI[rng.randint(min(i0, i1), max(i0, i1))]
        else:
            grado_p = None
        mestiere = {"nome": c.valore("mestiere.nome"), "grado": grado_p}
        origine["mestiere"] = c.campi["mestiere.nome"]["da"] + (f"; grado da {c.campi['mestiere.grado']['da']}" if grado else "")
    att = _pesa(rng, c.atteggiamento["frequenze"], evita.get("atteggiamento", set()))

    lon = c.valore("longevita")
    fattore = (lon or {}).get("fattore", 1)
    fase = bool(c.valore("fase_della_vita"))
    vera = anni * fattore if lon else (None if fase else anni)
    zona = c.strati.get("zona")
    luogo_s = f"{c.strati['regno']}/{zona}" if zona else f"{c.strati['regno']}/{c.strati['insediamento']}"
    for k in ("corporatura", "addestramento", "conta"):
        origine[k] = c.campi[k]["da"] if k in c.campi else "—"
    origine["profilo"] = ", ".join(f"{s} da {c.campi['profilo.' + s]['da']}" for s in D.STATISTICHE if "profilo." + s in c.campi)

    scheda = {
        "id": f"{zona or c.strati['regno']}/{D.slug(nome) if origine['nome'] != 'manca' else f'{ruolo}-{seme}'}",
        "dettaglio": "scheda",
        "provenienza": {"ruolo": ruolo, "eta": eta, "razza": razza, "luogo": luogo_s,
                        "insediamento": c.strati["insediamento"], "ritocchi": r["righe"], "seme": seme},
        "nome": nome, "genere": genere, "livello": livello, "ruolo": ruolo, "razza": razza,
        "eta": {"fase": eta, "apparente": anni, "vera": vera},
        "luogo": luogo_s,
        "conta": c.valore("conta") or "qualunque",
        "tratti": tratti,
        **pescate,
        "contraddizione": None,
        "voce": voce,
        "sa": [x["voce"] for x in c.elenchi.get("sa") or []],
        "dicerie": [x["voce"] for x in c.elenchi.get("dicerie") or []],
        "puo_dare": [x["voce"] for x in c.elenchi.get("puo_dare") or []],
        "no_tipici": [x["voce"] for x in c.elenchi.get("no_tipici") or []],
        "malizia": [x["voce"] for x in c.elenchi.get("malizia") or []],
        "segni": [x["voce"] for x in c.elenchi.get("segni") or []],
        "limiti": [x["voce"] for x in c.elenchi.get("limiti") or []],
        "corporatura": c.valore("corporatura") or "normale",
        "addestramento": c.valore("addestramento") or "nessuno",
        "profilo": {s: c.valore("profilo." + s) or "media" for s in D.STATISTICHE},
        "mestiere": mestiere,
        "ricchezza": ricchezza,
        "motivo": "; ".join(r["motivi"]) or None,
        "stato_iniziale": {"vivo": True, "atteggiamento_iniziale": att,
                           "affinita": c.valore("affinita_iniziale", -1), "memoria": [], "legami": []},
        "stato": {},
        "origine": origine,
        "da_ritoccare": [k for k in CAMPI_ROSA if pescate.get(k)] + ["contraddizione"],
        "ritratto": {"descrizione": "", "immagini": []},
    }
    if c.valore("rara_nel_luogo"):
        scheda["perche_qui"] = "; ".join(r["motivi"]) or None
        if not r["motivi"]:
            scheda["da_ritoccare"].append("perche_qui")
    scheda["contraddizione_spunto"] = (f"smentisci «{tratti[0]}»" + (f" o «{tratti[1]}»" if len(tratti) > 1 else "")
                                       + ": in che cosa questa persona fa il contrario?") if tratti else None
    scheda["ritratto"]["descrizione"] = descrizione_ritratto(scheda, c)
    avvisi += controlla_livello(scheda, c.valore("livello") if "livello" not in r else None, cat)
    return {"scheda": scheda, "errori": [], "avvisi": avvisi, "composizione": vista(c), "seme": seme}


def descrizione_ritratto(s: dict, c: Composizione | None = None) -> str:
    """Testo per il ritratto, composto dagli strati: razza e segni, età, corporatura, mestiere, tratti."""
    eta = {"bambino": "bambino" if s.get("genere") != "f" else "bambina",
           "ragazzo": "ragazzo" if s.get("genere") != "f" else "ragazza",
           "adulto": "adulto" if s.get("genere") != "f" else "adulta",
           "anziano": "anziano" if s.get("genere") != "f" else "anziana"}.get(s["eta"]["fase"], s["eta"]["fase"])
    pezzi = [f"{s['razza'].replace('_', ' ')}, {eta}, sui {s['eta']['apparente']} anni all'aspetto",
             f"corporatura {s['corporatura']}"]
    if s.get("segni"):
        pezzi.append("; ".join(s["segni"]))
    m = s.get("mestiere")
    pezzi.append(f"{s['ruolo'].replace('_', ' ')}" + (f", {m['nome']}" if m and m.get("nome") else ""))
    if c is not None and c.elenchi.get("dove"):
        pezzi.append(f"di solito {c.elenchi['dove'][0]['voce']}")
    if s.get("tratti"):
        pezzi.append("si vede che è " + " e ".join(s["tratti"]))
    pezzi.append({"povero": "vestiti consumati", "modesto": "vestiti semplici e puliti",
                  "agiato": "vestiti buoni", "ricco": "vestiti ricchi"}.get(s.get("ricchezza"), ""))
    return ". ".join(p[0].upper() + p[1:] for p in pezzi if p) + "."


def controlla_livello(s: dict, fascia: list | None, cat: D.Catalogo) -> list[str]:
    """Avvisi sul livello di una scheda: terzo alto senza motivo, adulto sopra gli anni senza motivo, oltre il 99."""
    out = []
    lv = int(s["livello"])
    motivo = s.get("motivo")
    if fascia and terzo_alto(fascia, lv) and not motivo:
        out.append(f"{s['nome']}: livello {lv} nel terzo alto della fascia {fascia[0]}-{fascia[1]} senza un motivo scritto")
    vera = s["eta"].get("apparente")
    if s["eta"]["fase"] == "adulto" and vera and lv > vera and not motivo:
        out.append(f"{s['nome']}: adulto qualunque con il livello ({lv}) sopra gli anni ({vera})")
    if lv > int(cat.regole.dati.get("gente_comune_max") or 99):
        out.append(f"{s['nome']}: livello {lv} oltre la gente comune ({R.power_rank(lv)})")
    return out


# ---------------------------------------------------------------------------------------------------------------
# Comparse
# ---------------------------------------------------------------------------------------------------------------
def comparse(luogo: dict, quante: int, ruoli: list[str] | None = None, seme: int | None = None,
             usati: set[str] | None = None, cat: D.Catalogo | None = None) -> dict:
    """Righe per riempire una scena: atteggiamenti dalle frequenze di Taratura §3 (al più un ben disposto se sono
    tre o più), voce e difetto che non si ripetono."""
    cat = cat or D.catalogo()
    seme = seme if seme is not None else random.SystemRandom().randrange(1, 2**31)
    rng = random.Random(seme)
    scena = cat.regole.dati.get("scena") or {}
    da_quanti, max_bd = int(scena.get("da_quanti_png") or 3), int(scena.get("ben_disposti_max") or 1)
    quante = max(1, min(int(quante), 30))
    ruoli = ruoli or ["cittadino", "contadino", "cittadino", "mercante_ambulante", "guardia", "viaggiatore"]
    ruoli = [r for r in ruoli if r in cat.ruoli] or ["cittadino"]
    reg = (cat.regni.dati or {}).get(luogo.get("regno") or (cat.zone.dati or {}).get(luogo.get("zona"), {}).get("regno")) or {}
    popoli = reg.get("popoli") or {"umano": 100}
    razze = [(k, v) for k, v in popoli.items() if k in cat.razze] or [("umano", 100)]
    usati = set(usati or set())
    evita: dict[str, set] = {"difetto": set(), "intercalare": set(), "atteggiamento": set()}
    righe, avvisi = [], []
    ben = 0
    for i in range(quante):
        ruolo = rng.choice(ruoli)
        razza = _pesa(rng, dict(razze))
        eta = _pesa(rng, {"adulto": 70, "anziano": 15, "ragazzo": 10, "bambino": 5})   # PROPOSTA
        if eta in ("bambino", "ragazzo") and ruolo not in ("cittadino", "contadino"):
            eta = "adulto"
        if quante >= da_quanti and ben >= max_bd:
            evita["atteggiamento"] = {"ben_disposto"}
        out = nuovo(ruolo, eta, razza, luogo, None, rng.randrange(1, 2**31), usati, evita, cat)
        s = out["scheda"]
        if s is None:
            avvisi += out["errori"]
            continue
        usati.add(s["nome"])
        evita["difetto"].add(s["difetto"])
        evita["intercalare"] |= {x for x in [s["voce"].split("dice spesso ")[-1]] if "dice spesso" in s["voce"]}
        att = s["stato_iniziale"]["atteggiamento_iniziale"]
        ben += att == "ben_disposto"
        righe.append({"dettaglio": "comparsa", "id": s["id"], "nome": s["nome"], "genere": s["genere"],
                      "ruolo": ruolo, "razza": razza, "eta": eta, "livello": s["livello"],
                      "tratto": s["tratti"][1] if len(s["tratti"]) > 1 else s["difetto"],
                      "difetto": s["difetto"], "atteggiamento": att, "voce": s["voce"],
                      "provenienza": s["provenienza"]})
    return {"comparse": righe, "seme": seme, "avvisi": avvisi}


# ---------------------------------------------------------------------------------------------------------------
# Numeri: blocco di combattimento e profilo, calcolati al momento e mai salvati
# ---------------------------------------------------------------------------------------------------------------
def stat_automatica(livello: int) -> int:
    """Valore automatico di una statistica base per un personaggio di quel livello, con il conto delle partite
    (Progressione §2: 10 alla creazione, +1 a ogni level up; a livello 2 si ha 11)."""
    return R.CREATION["base"] + (max(1, int(livello)) - 1) * R.LEVEL["auto_per_level"]


def profilo_numerico(s: dict, cat: D.Catalogo | None = None) -> dict:
    cat = cat or D.catalogo()
    molt = cat.regole.dati.get("profilo") or {}
    base = stat_automatica(s["livello"])
    return {k: R.clean(round(base * float(molt.get((s.get("profilo") or {}).get(k, "media"), 1)), 1))
            for k in D.STATISTICHE} | {"_base": base}


def combattimento(s: dict, cat: D.Catalogo | None = None) -> dict:
    cat = cat or D.catalogo()
    reg = cat.regole.dati
    if s.get("dettaglio") == "comparsa" and "addestramento" not in s:
        return {"combatte": None, "nota": "una comparsa non ha i numeri: promuovila a scheda"}
    if (s.get("eta") or {}).get("fase") == "bambino":
        return {"combatte": False, "nota": "un bambino non è un bersaglio: non ha blocco di combattimento"}
    add = (reg.get("addestramento") or {}).get(s.get("addestramento") or "nessuno") or {}
    if add.get("blocco") is False:
        return {"combatte": False,
                "nota": "non combatte: scappa, grida, si arrende. La morte è definitiva e non rischia senza motivo "
                        "(Sistema_PNG §3)."}
    taglia = (reg.get("corporatura") or {}).get(s.get("corporatura") or "normale", "Normale")
    rarita = reg.get("rarita_png") or "Comune"
    lv = int(s["livello"])
    fattore = float(add.get("danno", 1))
    modello = reg.get("modello_numeri_png") or "creatura"
    if modello == "personaggio":
        p = profilo_numerico(s, cat)
        stats = [{"code": k, "iniziale": R.CREATION["base"], "levelup": p["_base"] - R.CREATION["base"],
                  "altro": p[k] - p["_base"]} for k in D.STATISTICHE]
        d = R.derived_values({"stats": stats})
        arma = R.rarity_info(reg.get("arma_modello_personaggio") or "Comune")["weapon_base"]
        base_arma = (arma[0] + (arma[1] or arma[0])) / 2
        danno = base_arma * (1 + p["STR"] / 100) * fattore
        out = {"vita": d.get("hp"), "mana": d.get("mp"), "stamina": d.get("sp"),
               "danno": R.clean(round(danno, 1)),
               "formula_vita": "100 + VIT × 15 (Progressione §6)",
               "formula_danno": f"base media arma {reg.get('arma_modello_personaggio') or 'Comune'} {R.fmt_it(base_arma)} × (1 + STR/100) × {R.fmt_it(fattore)}"}
    else:
        k = R.creature(lv, rarita, taglia)
        out = {"vita": k["hp"], "danno": R.clean(round(k["dmg"] * fattore, 1)),
               "formula_vita": k["hp_formula"], "formula_danno": k["dmg_formula"] + (f" × {R.fmt_it(fattore)} (addestramento)" if fattore != 1 else "")}
    out.update({"combatte": True, "modello": modello, "livello": lv, "taglia": taglia, "rarita": rarita,
                "addestramento": s.get("addestramento"), "abilita": add.get("abilita"),
                "rango": R.power_rank(lv)})
    return out


# ---------------------------------------------------------------------------------------------------------------
# Promozione, aggiornamento, riga di zona
# ---------------------------------------------------------------------------------------------------------------
def promuovi(s: dict, usati: set[str] | None = None, cat: D.Catalogo | None = None) -> dict:
    """Comparsa → scheda semplificata → scheda completa. Aggiunge campi, non riscrive quelli che ci sono."""
    cat = cat or D.catalogo()
    d = s.get("dettaglio") or "scheda"
    if d == "comparsa":
        p = s["provenienza"]
        regno, resto = p["luogo"].split("/", 1)
        luogo = {"regno": regno, "insediamento": p.get("insediamento")}
        if resto not in D.INSEDIAMENTI:
            luogo["zona"] = resto
        rit = list(p.get("ritocchi") or []) + [f"livello {s['livello']}", f"nome {s['nome']}", f"genere {s['genere']}"]
        out = nuovo(p["ruolo"], s.get("eta") or "adulto", p["razza"], luogo, rit, p.get("seme"), usati, None, cat)
        if out["scheda"] is None:
            return {"scheda": None, "errori": out["errori"], "avvisi": out["avvisi"]}
        n = out["scheda"]
        n["id"] = s.get("id") or n["id"]
        n["provenienza"]["ritocchi"] = list(p.get("ritocchi") or [])
        n["stato_iniziale"]["atteggiamento_iniziale"] = s.get("atteggiamento") or n["stato_iniziale"]["atteggiamento_iniziale"]
        for k in ("difetto", "voce"):
            if s.get(k):
                n[k] = s[k]
        n["stato"] = deepcopy(s.get("stato") or {})
        n["origine"]["livello"] = n["origine"]["nome"] = "comparsa"
        n["ritratto"] = s.get("ritratto") or n["ritratto"]
        return {"scheda": n, "errori": [], "avvisi": out["avvisi"]}
    if d == "scheda":
        n = deepcopy(s)
        n["dettaglio"] = "completa"
        n.setdefault("completa", {
            "posizione": s.get("ruolo"), "regno": (s.get("luogo") or "").split("/")[0],
            "personalita": {"tratti": s.get("tratti") or [], "motivazioni": s.get("vuole"), "paure": s.get("teme"),
                            "manie": ""},
            "background": {"origine": "", "eventi_formativi": "", "relazioni": "", "segreti": ""},
            "obiettivi": {"breve": s.get("vuole"), "lungo": "", "conflitti": s.get("contraddizione") or ""},
            "risorse": {"competenze": s.get("sa") or [], "influenza": s.get("conta"), "ricchezze": s.get("ricchezza"),
                        "connessioni": ""},
            "quest": {"principale": "", "secondarie": "", "ganci": ""},
        })
        return {"scheda": n, "errori": [], "avvisi": ["scheda completa (Sistema_PNG §4): compila background, obiettivi a lungo termine e quest"]}
    return {"scheda": deepcopy(s), "errori": ["è già una scheda completa"], "avvisi": []}


def aggiorna(s: dict, partita: str, evento: dict, cat: D.Catalogo | None = None) -> dict:
    """Dopo una sessione: affinità, memoria, legami, vivo o morto. Rispetta Taratura §4 (al massimo +1 per
    interazione e per giorno, perdite doppie, prima impressione tripla) e avvisa se un'eccezione li supera."""
    cat = cat or D.catalogo()
    a = cat.regole.dati.get("affinita") or {}
    lo, hi = (a.get("scala") or [-10, 10])
    n = deepcopy(s)
    st = n.setdefault("stato", {}).setdefault(str(partita), deepcopy(n.get("stato_iniziale") or {
        "vivo": True, "atteggiamento_iniziale": None, "affinita": -1, "memoria": [], "legami": []}))
    st.setdefault("registro", [])
    avvisi: list[str] = []
    giorno = evento.get("giorno")
    if "affinita" in evento and evento["affinita"] not in (None, 0):
        x = int(evento["affinita"])
        applicato = x
        perche = []
        if evento.get("prima_impressione"):
            applicato *= int(a.get("prima_impressione") or 3)
            perche.append("prima impressione ×3")
        elif x < 0:
            applicato *= int(a.get("perdita") or 2)
            perche.append("perdita ×2")
        if x > 0:
            eccezione = a.get("eccezione") or [2, 3]
            oggi = sum(r["applicato"] for r in st["registro"] if r.get("giorno") == giorno and r["applicato"] > 0)
            if evento.get("eccezione"):
                if any(r.get("eccezione") for r in st["registro"]):
                    avvisi.append("l'eccezione (+2 o +3) vale una volta sola: è già stata usata")
                if x > eccezione[1]:
                    avvisi.append(f"eccezione oltre +{eccezione[1]}")
            else:
                if x > int(a.get("max_per_interazione") or 1):
                    avvisi.append(f"+{x} in una interazione: il massimo è +{a.get('max_per_interazione') or 1}")
                if giorno is not None and oggi + applicato > int(a.get("max_per_giorno") or 1):
                    avvisi.append(f"oltre +{a.get('max_per_giorno') or 1} nello stesso giorno di gioco per questo PNG")
            prima = st.get("affinita", -1)
            if prima + applicato > 4 and prima <= 4:
                avvisi.append("oltre +4 servono settimane di gioco e un costo reale per il forestiero (Taratura §4)")
        nuovo_v = max(lo, min(hi, int(st.get("affinita", -1)) + applicato))
        st["registro"].append({"giorno": giorno, "chiesto": x, "applicato": applicato, "motivo": evento.get("motivo") or "",
                               "eccezione": bool(evento.get("eccezione")), "regola": ", ".join(perche)})
        st["affinita"] = nuovo_v
    for k in ("memoria", "legami"):
        for v in evento.get(k) or []:
            st.setdefault(k, []).append(v if isinstance(v, dict) else {"giorno": giorno, "testo": str(v)})
    if evento.get("morto"):
        m = evento["morto"] if isinstance(evento["morto"], dict) else {"causa": str(evento["morto"])}
        st["vivo"] = False
        st["morte"] = {"giorno": m.get("giorno", giorno), "causa": m.get("causa", "")}
        avvisi.append(f"{n['nome']} è morto: la scheda resta, il suo posto è vuoto finché qualcuno non lo prende")
    return {"scheda": n, "avvisi": avvisi}


def blocco_forgia(livello: int, taglia: str | None, combatte: bool = True) -> dict:
    """Il blocco di combattimento del wizard PNG della Forgia, con lo stesso calcolo delle schede dai preset
    (un solo posto: se cambia il modello dei numeri, cambia anche lì). Restituisce la forma che il wizard usa."""
    s = {"livello": max(1, int(livello or 1)), "eta": {"fase": "adulto"},
         "addestramento": "addestrato" if combatte else "nessuno", "corporatura": (taglia or "Normale").lower()}
    b = combattimento(s)
    return {"hp": b.get("vita"), "dmg": b.get("danno"), "hp_formula": b.get("formula_vita"),
            "dmg_formula": b.get("formula_danno"), "modello": b.get("modello")}


def da_forgia(npc: dict) -> dict:
    """Scheda completa (Sistema_PNG §4) dal PNG creato con il wizard della Forgia: stessa forma di `promuovi`."""
    p = npc.get("personality") or {}
    b = npc.get("background") or {}
    g = npc.get("goals") or {}
    r = npc.get("resources") or {}
    return {
        "dettaglio": "completa", "nome": npc.get("name"), "livello": npc.get("level"),
        "ruolo": npc.get("role"), "razza": npc.get("race"), "luogo": npc.get("place"),
        "eta": {"fase": None, "apparente": npc.get("age") or None, "vera": None},
        "provenienza": {"forgia": True},
        "addestramento": "addestrato" if npc.get("combat") else "nessuno",
        "corporatura": str((npc.get("combat") or {}).get("size") or "Normale").lower(),
        "voce": p.get("speech") or "", "tratti": [t.strip() for t in str(p.get("traits") or "").split(",") if t.strip()],
        "vuole": g.get("short") or "", "teme": p.get("fears") or "",
        "completa": {
            "posizione": npc.get("role"), "regno": npc.get("kingdom"),
            "personalita": {"tratti": p.get("traits"), "motivazioni": p.get("motives"), "paure": p.get("fears"),
                            "manie": p.get("habits")},
            "background": {"origine": b.get("origin"), "eventi_formativi": b.get("events"), "relazioni": b.get("relations"),
                           "segreti": npc.get("secret")},
            "obiettivi": {"breve": g.get("short"), "lungo": g.get("long"), "conflitti": g.get("conflict")},
            "risorse": {"competenze": r.get("skills"), "influenza": r.get("influence"), "ricchezze": r.get("wealth"),
                        "connessioni": r.get("connections")},
            "quest": {"principale": "", "secondarie": "", "ganci": ""},
        },
        "stato": {}, "ritratto": {"descrizione": "", "immagini": []},
    }


def riga_zona(s: dict) -> dict:
    """La riga per la tabella «PNG» di una scheda di zona: Nome | Lv | Ruolo | Tratto chiave | Teoria sui forestieri | Cosa può dare."""
    tratto = ", ".join((s.get("tratti") or [])[:3]) or s.get("tratto") or ""
    puo = "; ".join((s.get("puo_dare") or [])[:3])
    celle = [s.get("nome", ""), str(s.get("livello", "")), (s.get("ruolo") or "").replace("_", " "), tratto,
             s.get("forestieri") or "", puo]
    return {"celle": celle, "markdown": "| " + " | ".join(c.replace("|", "/") for c in celle) + " |"}


def confronta(ruolo: str, luogo: dict | None = None, cat: D.Catalogo | None = None) -> dict:
    """Le varianti di razza di un ruolo: solo i campi che cambiano rispetto all'umano (adulto)."""
    cat = cat or D.catalogo()
    luogo = luogo or {"regno": "valeria", "insediamento": "villaggio"}
    base = componi(ruolo, "adulto", "umano", luogo, None, cat)
    righe = {}
    for razza in cat.razze:
        if razza == "umano":
            continue
        c = componi(ruolo, "adulto", razza, luogo, None, cat)
        diff = {}
        for k, v in c.campi.items():
            if k in ("rara_nel_luogo",):
                continue
            b = base.campi.get(k)
            if b is None or b["valore"] != v["valore"]:
                diff[k] = {"umano": b["valore"] if b else None, razza: v["valore"], "da": v["da"]}
        for k, v in c.elenchi.items():
            bv = {x["voce"] for x in base.elenchi.get(k) or []}
            agg = [x for x in v if x["voce"] not in bv]
            tolte = sorted(bv - {x["voce"] for x in v})
            if agg or tolte:
                diff[k] = {"aggiunte": [{"voce": x["voce"], "da": x["da"]} for x in agg], "tolte": tolte}
        f = c.atteggiamento["frequenze"]
        if f != base.atteggiamento["frequenze"]:
            diff["atteggiamento"] = {"umano": base.atteggiamento["frequenze"], razza: f}
        righe[razza] = {"cambia": diff, "errori": c.errori, "motivo_richiesto": c.motivo_richiesto}
    return {"ruolo": ruolo, "luogo": luogo, "varianti": righe}
