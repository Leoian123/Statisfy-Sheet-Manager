"""Composizione dei preset: ruolo → età → razza (e varianti del ruolo) → luogo → ritocchi.

Il risultato non è una persona: è lo stampo composto, con accanto a ogni valore lo strato che l'ha deciso
(«da»), il file e la riga («dove») e il commento FONTE/PROPOSTA («nota»). `genera.py` pesca da qui.

Chi vince (prompt §3): i ritocchi su tutto (il controllo avvisa e obbedisce); la scheda di zona e il regno sui preset
per ciò che nominano; lo strato più specifico sul più generico; fra due fasce di livello l'intersezione, e se è
vuota la più bassa.
"""
from __future__ import annotations

import math
import re
from copy import deepcopy
from typing import Any

from . import dati as D
from .dati import File

ORDINE = ["ruolo", "eta", "razza", "luogo", "ritocchi"]
SCALARI = ["corporatura", "addestramento", "ricchezza"]
TUTTI_ELENCHI = D.ROSE + D.ELENCHI


class ErroreStrato(ValueError):
    """Uno strato richiesto non esiste nel catalogo."""


# ---------------------------------------------------------------------------------------------------------------
# Ritocchi: righe libere («ex soldato», «livello 61») o chiavi esplicite. Una riga che non è un campo è un motivo.
# ---------------------------------------------------------------------------------------------------------------
def leggi_ritocchi(ritocchi: list | dict | None) -> dict:
    out: dict[str, Any] = {"motivi": [], "profilo": {}, "righe": []}
    voci = ritocchi if isinstance(ritocchi, list) else [ritocchi] if ritocchi else []
    for v in voci:
        if isinstance(v, dict):
            for k, x in v.items():
                if k == "motivo":
                    out["motivi"].append(str(x))
                elif k == "profilo" and isinstance(x, dict):
                    out["profilo"].update(x)
                else:
                    out[k] = x
            out["righe"].append(", ".join(f"{k} {x}" for k, x in v.items()))
            continue
        t = str(v).strip()
        if not t:
            continue
        out["righe"].append(t)
        m = re.fullmatch(r"(?i)livello\s+(\d+)(?:\s*-\s*(\d+))?", t)
        if m:
            out["livello"] = [int(m[1]), int(m[2] or m[1])]
            continue
        m = re.fullmatch(r"(?i)anni\s+(\d+)", t)
        if m:
            out["anni"] = int(m[1])
            continue
        m = re.fullmatch(r"(?i)(STR|DEX|VIT|INT)\s+(bassa|media|alta)", t)
        if m:
            out["profilo"][m[1].upper()] = m[2].lower()
            continue
        m = re.fullmatch(r"(?i)grado\s+([IVX]+)", t)
        if m and m[1].upper() in D.GRADI:
            out["grado"] = m[1].upper()
            continue
        m = re.fullmatch(r"(?i)(corporatura|addestramento|ricchezza|conta|genere|nome|mestiere)\s*:?\s+(.+)", t)
        if m:
            out[m[1].lower()] = m[2].strip()
            continue
        m = re.fullmatch(r"(?i)motivo\s*:\s*(.+)", t)
        out["motivi"].append(m[1].strip() if m else t)
    return out


# ---------------------------------------------------------------------------------------------------------------
# Stato della composizione
# ---------------------------------------------------------------------------------------------------------------
class Composizione:
    def __init__(self, cat: D.Catalogo, strati: dict, ritocchi: dict):
        self.cat = cat
        self.strati = strati
        self.ritocchi = ritocchi
        self.campi: dict[str, dict] = {}
        self.elenchi: dict[str, list[dict]] = {k: [] for k in TUTTI_ELENCHI}
        pc = cat.regole.dati.get("primo_contatto") or {}
        self.atteggiamento = {"pesi": {k: float(pc.get(k, 0)) for k in D.ATTEGGIAMENTI},
                              "storia": [_o("regole", cat.regole, "primo_contatto")]}
        self.bloccati: set[str] = set()
        self.avvisi: list[str] = []
        self.errori: list[str] = []
        self.motivo_richiesto: list[str] = []
        self.canone: list[str] = []

    # -- campi singoli --
    def metti(self, campo: str, valore, origine: dict, forza: bool = False) -> None:
        if campo in self.bloccati and not forza:
            return
        prima = self.campi.get(campo)
        self.campi[campo] = {"valore": valore, **origine, "prima": prima["valore"] if prima else None}

    def valore(self, campo: str, default=None):
        c = self.campi.get(campo)
        return c["valore"] if c else default

    # -- applicazione di uno strato --
    def applica(self, etichetta: str, f: File, base: tuple, d: dict) -> None:
        if not isinstance(d, dict):
            return
        for k, v in d.items():
            p = base + (k,)
            o = _o(etichetta, f, *p)
            if k in SCALARI:
                self._scala(k, v, o, D.SCALE[k], etichetta)
            elif k == "conta":
                self.metti("conta", v, o)
            elif k == "profilo" and isinstance(v, dict):
                for s, x in v.items():
                    self._scala(f"profilo.{s}", x, _o(etichetta, f, *p, s), D.SCALE["profilo"], etichetta)
            elif k == "numeri" and isinstance(v, dict):
                self.applica(etichetta, f, p, v)
            elif k == "mestiere":
                self._mestiere(v, f, p, etichetta)
            elif k in D.TESTI and k != "descrizione":
                self.metti(k, v, o)
            elif k == "rose" and isinstance(v, dict):
                for r, x in v.items():
                    self._lista(r, x, f, p + (r,), etichetta)
            elif k in D.ELENCHI:
                self._lista(k, v, f, p, etichetta)
            elif k == "atteggiamento" and isinstance(v, dict):
                for a, x in v.items():
                    if a in self.atteggiamento["pesi"]:
                        self.atteggiamento["pesi"][a] += float(x or 0)
                if v:
                    self.atteggiamento["storia"].append({**o, "sposta": v})
            elif k == "canone":
                self.canone += [str(x) for x in (v if isinstance(v, list) else [v])]
            elif k == "richiede_motivo":
                self.motivo_richiesto.append(f"{etichetta}: {v}")

    def _scala(self, campo: str, v, o: dict, scala: list, etichetta: str) -> None:
        if isinstance(v, dict) and "sposta" in v:
            att = self.valore(campo)
            if att is None or isinstance(att, list):
                return
            i = scala.index(att) + int(v["sposta"]) if att in scala else None
            if i is None:
                return
            nuovo = scala[max(0, min(len(scala) - 1, i))]
            if campo in self.bloccati:
                return
            self.metti(campo, nuovo, {**o, "sposta": int(v["sposta"])})
        else:
            self.metti(campo, v, o)
            if v == "nessuno" and etichetta.startswith("età"):
                self.bloccati.add(campo)

    def _mestiere(self, v, f: File, p: tuple, etichetta: str) -> None:
        o = _o(etichetta, f, *p)
        if v == "nessuno" or v is None:
            self.metti("mestiere.nome", None, o)
            self.metti("mestiere.grado", None, o)
            if etichetta.startswith("età"):
                self.bloccati |= {"mestiere.nome", "mestiere.grado"}
            return
        if not isinstance(v, dict):
            return
        if "nome" in v:
            self.metti("mestiere.nome", v["nome"], _o(etichetta, f, *p, "nome"))
        g = v.get("grado")
        if isinstance(g, dict) and "sposta" in g:
            att = self.valore("mestiere.grado")
            if att and "mestiere.grado" not in self.bloccati:
                n = int(g["sposta"])
                nuovo = [_grado(att[0], n), _grado(att[1], n)]
                self.metti("mestiere.grado", nuovo, {**_o(etichetta, f, *p, "grado"), "sposta": n})
        elif isinstance(g, list):
            self.metti("mestiere.grado", [str(x) for x in g], _o(etichetta, f, *p, "grado"))

    def _lista(self, k: str, v, f: File, p: tuple, etichetta: str) -> None:
        if k not in self.elenchi:
            return
        voci = self.elenchi[k]
        def nuova(x, i):
            return {"voce": str(x), **_o(etichetta, f, *p, *([i] if i is not None else []))}
        if isinstance(v, list):
            gia = {x["voce"] for x in voci}
            voci += [nuova(x, i) for i, x in enumerate(v) if str(x) not in gia]
        elif isinstance(v, dict):
            if "solo" in v:
                voci[:] = [{"voce": str(x), **_o(etichetta, f, *p, "solo", i)} for i, x in enumerate(v["solo"] or [])]
            if "togli" in v:
                via = {str(x) for x in v["togli"] or []}
                voci[:] = [x for x in voci if x["voce"] not in via]
            if "aggiungi" in v:
                gia = {x["voce"] for x in voci}
                voci += [{"voce": str(x), **_o(etichetta, f, *p, "aggiungi", i)}
                         for i, x in enumerate(v["aggiungi"] or []) if str(x) not in gia]
        elif v is not None:
            gia = {x["voce"] for x in voci}
            if str(v) not in gia:
                voci.append(nuova(v, None))


def _o(etichetta: str, f: File, *p) -> dict:
    return {"da": etichetta, "dove": f.dove(*p), "nota": f.nota(*p)}


def _grado(g: str, n: int) -> str:
    i = D.GRADI.index(g) if g in D.GRADI else 0
    return D.GRADI[max(0, min(9, i + n))]


def interseca(a: list | None, b: list | None) -> tuple[list | None, str]:
    """Intersezione di due fasce; se è vuota vince la più bassa (nessuno strato alza un livello sopra un tetto)."""
    if a is None:
        return b, "b"
    if b is None:
        return a, "a"
    lo, hi = max(a[0], b[0]), min(a[1], b[1])
    if lo <= hi:
        return [lo, hi], "intersezione"
    return (a, "a") if a[1] <= b[1] else (b, "b")


def fascia_da_anni(anni: list, regola: list) -> list:
    """Livello «fra metà degli anni e gli anni che ha»: dalla fascia di anni a quella di livello."""
    return [max(1, math.ceil(anni[0] * float(regola[0]))), max(1, math.floor(anni[1] * float(regola[1])))]


# ---------------------------------------------------------------------------------------------------------------
# Composizione
# ---------------------------------------------------------------------------------------------------------------
def risolvi_luogo(cat: D.Catalogo, luogo: dict) -> dict:
    """luogo = {regno, insediamento, zona?}: la zona porta regno e insediamento se mancano."""
    zona = luogo.get("zona")
    z = (cat.zone.dati or {}).get(zona) if zona else None
    if zona and z is None:
        raise ErroreStrato(f"zona «{zona}» sconosciuta")
    regno = luogo.get("regno") or (z or {}).get("regno")
    ins = luogo.get("insediamento") or (z or {}).get("insediamento")
    return {"regno": regno, "insediamento": ins, "zona": zona}


def componi(ruolo: str, eta: str, razza: str, luogo: dict, ritocchi: list | dict | None = None,
            cat: D.Catalogo | None = None) -> Composizione:
    cat = cat or D.catalogo()
    rf = cat.ruoli.get(ruolo)
    if rf is None:
        raise ErroreStrato(f"ruolo «{ruolo}» sconosciuto (ci sono: {', '.join(cat.ruoli)})")
    ef = cat.eta.get(eta)
    if ef is None:
        raise ErroreStrato(f"età «{eta}» sconosciuta (ci sono: {', '.join(cat.eta)})")
    zf = cat.razze.get(razza)
    if zf is None:
        raise ErroreStrato(f"razza «{razza}» sconosciuta (ci sono: {', '.join(cat.razze)})")
    lu = risolvi_luogo(cat, luogo)
    regni = cat.regni.dati or {}
    if lu["regno"] not in regni:
        raise ErroreStrato(f"regno «{lu['regno']}» sconosciuto (ci sono: {', '.join(regni)})")
    if lu["insediamento"] not in D.INSEDIAMENTI:
        raise ErroreStrato(f"insediamento «{lu['insediamento']}» sconosciuto (villaggio, citta, metropoli)")
    rit = leggi_ritocchi(ritocchi)
    strati = {"ruolo": ruolo, "eta": eta, "razza": razza, **lu, "ritocchi": rit["righe"]}
    c = Composizione(cat, strati, rit)

    # 0. base comune: i difetti della scheda minima (Taratura §2) valgono per tutti, gli strati aggiungono o tolgono
    c._lista("difetto", (cat.regole.dati or {}).get("difetti") or [], cat.regole, ("difetti",), "regole")

    # 1. ruolo (con l'eventuale ruolo da cui eredita: un livello solo)
    base_nome = (rf.dati or {}).get("eredita")
    bf = cat.ruoli.get(base_nome) if base_nome else None
    if base_nome and bf is None:
        c.errori.append(f"{rf.rel}: eredita da «{base_nome}», che non esiste")
    if bf is not None:
        c.applica(f"ruolo {base_nome}", bf, (), _senza(bf.dati, "livello", "varianti_razza", "eredita"))
    c.applica(f"ruolo {ruolo}", rf, (), _senza(rf.dati, "livello", "varianti_razza", "eredita"))

    # 2. età
    c.applica(f"età {eta}", ef, (), _senza(ef.dati, "livello", "anni"))

    # 3. razza: il file generico, poi le varianti del ruolo (vincono per i campi che nominano)
    c.applica(f"razza {razza}", zf, (), _senza(zf.dati, "dove_vive", "nomi", "tacciono", "longevita",
                                                 "fase_della_vita", "nome_nei_documenti", "conta_per_i_suoi"))
    for f, n in ((bf, base_nome), (rf, ruolo)):
        var = ((f.dati or {}).get("varianti_razza") or {}).get(razza) if f is not None else None
        if var:
            c.applica(f"{n} · variante {razza}", f, ("varianti_razza", razza), var)

    # 4. luogo
    _livello_e_anni(c, cat, rf, bf, ef, zf, lu)
    _luogo(c, cat, lu, razza)

    # 5. ritocchi: vincono su tutto, il controllo avvisa e obbedisce
    _ritocchi(c, eta)

    # pesi dell'atteggiamento: normalizzati a 100, con il tetto
    c.atteggiamento["frequenze"] = frequenze(c.atteggiamento["pesi"], float(cat.regole.dati.get("tetto_atteggiamento") or 100),
                                             c.avvisi)
    if c.motivo_richiesto and not rit["motivi"]:
        c.errori += [f"serve un motivo — {m}" for m in c.motivo_richiesto]
    elif c.motivo_richiesto:
        c.avvisi += [f"motivo dato ({'; '.join(rit['motivi'])}) per: {m}" for m in c.motivo_richiesto]
    return c


def _senza(d: dict | None, *chiavi) -> dict:
    return {k: v for k, v in (d or {}).items() if k not in chiavi}


def _livello_e_anni(c: Composizione, cat: D.Catalogo, rf: File, bf: File | None, ef: File, zf: File, lu: dict) -> None:
    ins = lu["insediamento"]
    # fascia del ruolo per la taglia dell'insediamento (il ruolo specifico vince su quello da cui eredita)
    fascia, o = None, None
    for f, n in ((bf, (bf.rel if bf else "")), (rf, rf.rel)):
        if f is None:
            continue
        liv = (f.dati or {}).get("livello") or {}
        if ins in liv:
            fascia = liv[ins]
            o = _o(f"ruolo {f.rel.rsplit('/', 1)[-1][:-5]} ({ins})", f, "livello", ins)
    if fascia is None:
        c.errori.append(f"la fascia di livello del ruolo «{c.strati['ruolo']}» per «{ins}» non è scritta: "
                        f"serve un ritocco «livello N» o una zona che la scriva")
        o = o or {"da": "ruolo", "dove": rf.rel, "nota": ""}
    c.metti("livello", fascia, o or {})

    # canone del regno per quel ruolo (Mysteria): vince sul preset
    reg = (cat.regni.dati or {}).get(lu["regno"]) or {}
    fr = ((reg.get("fasce_ruoli") or {}).get(c.strati["ruolo"]) or {}).get(ins)
    if fr is not None:
        c.metti("livello", fr, _o(f"regno {lu['regno']}", cat.regni, lu["regno"], "fasce_ruoli", c.strati["ruolo"], ins))
    fgc = reg.get("fascia_gente_comune")
    if fgc and c.valore("livello"):
        nuova, chi = interseca(c.valore("livello"), fgc)
        if nuova != c.valore("livello"):
            c.metti("livello", nuova, _o(f"regno {lu['regno']} (gente comune)", cat.regni, lu["regno"], "fascia_gente_comune"))

    # anni dell'età; longevità della razza
    anni = list((ef.dati or {}).get("anni") or [18, 59])
    if anni[1] is None:
        anni[1] = int(cat.regole.dati.get("anni_massimi") or 90)
    c.metti("anni", anni, _o(f"età {c.strati['eta']}", ef, "anni"))
    lon = (zf.dati or {}).get("longevita")
    fattori = cat.regole.dati.get("longevita") or {}
    if lon is None:
        c.avvisi.append(f"razza {c.strati['razza']}: la longevità non è scritta; uso quella umana")
        c.metti("longevita", None, _o(f"razza {c.strati['razza']}", zf, "longevita"))
    else:
        c.metti("longevita", {"tipo": lon, "fattore": fattori.get(lon, 1)}, _o(f"razza {c.strati['razza']}", zf, "longevita"))
    if (zf.dati or {}).get("fase_della_vita"):
        c.metti("fase_della_vita", True, _o(f"razza {c.strati['razza']}", zf, "fase_della_vita"))

    # livello che segue gli anni (bambini, ragazzi): intersezione con la fascia del ruolo, se vuota la più bassa
    regola = ((ef.dati or {}).get("livello") or {})
    if isinstance(regola, dict) and "da_anni" in regola:
        da_anni = fascia_da_anni(anni, regola["da_anni"])
        c.metti("livello_da_anni", regola["da_anni"], _o(f"età {c.strati['eta']}", ef, "livello", "da_anni"))
        nuova, chi = interseca(c.valore("livello"), da_anni)
        if chi != "a":
            c.metti("livello", nuova, _o(f"età {c.strati['eta']} (segue gli anni)", ef, "livello", "da_anni"))


def _luogo(c: Composizione, cat: D.Catalogo, lu: dict, razza: str) -> None:
    reg = (cat.regni.dati or {}).get(lu["regno"]) or {}
    popoli = reg.get("popoli")
    if popoli is None:
        c.avvisi.append(f"regno {lu['regno']}: le proporzioni dei popoli non sono scritte; non so se «{razza}» è rara")
    else:
        quota = popoli.get(razza)
        if quota is None or quota < 10:
            c.metti("rara_nel_luogo", True, _o(f"regno {lu['regno']}", cat.regni, lu["regno"], "popoli"))
            if not c.ritocchi["motivi"]:
                c.avvisi.append(f"razza rara nel luogo: {razza} a {reg.get('nome') or lu['regno']} "
                                f"({'non elencata' if quota is None else f'{quota} su cento'}); la scheda deve dire perché è lì")
    c.metti("moneta", reg.get("moneta"), _o(f"regno {lu['regno']}", cat.regni, lu["regno"], "moneta"))
    c.metti("conta_nel_regno", reg.get("conta"), _o(f"regno {lu['regno']}", cat.regni, lu["regno"], "conta"))
    ins = (cat.insediamenti.dati or {}).get(lu["insediamento"]) or {}
    c.metti("voci_girano", ins.get("voci"), _o(f"insediamento {lu['insediamento']}", cat.insediamenti, lu["insediamento"], "voci"))
    aff = (cat.regole.dati.get("affinita") or {}).get("iniziale") or {}
    tipo = "normale"
    if lu.get("zona"):
        z = (cat.zone.dati or {}).get(lu["zona"]) or {}
        tipo = z.get("affinita_iniziale") or "normale"
        c.metti("affinita_iniziale", aff.get(tipo, -1), _o(f"zona {lu['zona']}", cat.zone, lu["zona"], "affinita_iniziale"))
        if z.get("regno") and z["regno"] != lu["regno"]:
            c.avvisi.append(f"la zona {lu['zona']} è in {z['regno']}, non in {lu['regno']}")
    else:
        c.metti("affinita_iniziale", aff.get(tipo, -1), _o("regole", cat.regole, "affinita", "iniziale", tipo))


def _ritocchi(c: Composizione, eta: str) -> None:
    r = c.ritocchi
    o = {"da": "ritocco", "dove": "", "nota": ""}
    if "livello" in r:
        fascia = c.valore("livello")
        c.metti("livello", r["livello"], o, forza=True)
        if fascia and (r["livello"][0] < fascia[0] or r["livello"][1] > fascia[1]):
            c.avvisi.append(f"ritocco: livello {_fmt_f(r['livello'])} fuori dalla fascia composta {_fmt_f(fascia)}")
        tetto = int(c.cat.regole.dati.get("gente_comune_max") or 99)
        if r["livello"][1] > tetto:
            c.avvisi.append(f"ritocco: livello {_fmt_f(r['livello'])} oltre la gente comune (1-{tetto}, Sistema_PNG §2)")
    if "anni" in r:
        c.metti("anni", [int(r["anni"]), int(r["anni"])], o, forza=True)
        regola = c.valore("livello_da_anni")
        if regola and "livello" not in r:
            nuova, _ = interseca(c.campi["livello"]["valore"], fascia_da_anni(c.valore("anni"), regola))
            c.metti("livello", nuova, {"da": f"età {eta} (anni del ritocco)", "dove": "", "nota": ""})
    for k in ("corporatura", "addestramento", "ricchezza", "conta", "voce"):
        if k in r:
            c.metti(k, r[k], o, forza=True)
    for s, v in (r.get("profilo") or {}).items():
        c.metti(f"profilo.{s}", v, o, forza=True)
    if "mestiere" in r:
        c.metti("mestiere.nome", r["mestiere"], o, forza=True)
        if not c.valore("mestiere.grado"):
            c.metti("mestiere.grado", ["I", "I"], o, forza=True)
    if "grado" in r:
        c.metti("mestiere.grado", [r["grado"], r["grado"]], o, forza=True)
    if eta == "bambino":
        if c.valore("mestiere.nome"):
            c.avvisi.append("ritocco: un bambino con un mestiere (un bambino non è un adulto piccolo)")
        if c.valore("addestramento") not in (None, "nessuno"):
            c.avvisi.append("ritocco: un bambino che combatte (non è un bersaglio)")


def _fmt_f(f: list | None) -> str:
    if not f:
        return "—"
    return str(f[0]) if f[0] == f[1] else f"{f[0]}-{f[1]}"


def frequenze(pesi: dict, tetto: float, avvisi: list | None = None) -> dict:
    """Pesi → percentuali intere che sommano a 100, nessuna oltre il tetto (il resto va agli altri in proporzione)."""
    p = {k: max(0.0, float(v)) for k, v in pesi.items()}
    tot = sum(p.values()) or 1.0
    p = {k: v * 100 / tot for k, v in p.items()}
    for _ in range(10):
        sopra = {k: v for k, v in p.items() if v > tetto + 1e-9}
        if not sopra:
            break
        if avvisi is not None:
            avvisi += [f"atteggiamento «{k}» al {round(v)}%: ridotto al tetto del {round(tetto)}%" for k, v in sopra.items()]
        eccesso = sum(v - tetto for v in sopra.values())
        sotto = {k: v for k, v in p.items() if k not in sopra}
        base = sum(sotto.values()) or 1.0
        p = {k: (tetto if k in sopra else v + eccesso * (v / base)) for k, v in p.items()}
    interi = {k: math.floor(v) for k, v in p.items()}
    resto = 100 - sum(interi.values())
    for k in sorted(p, key=lambda k: p[k] - interi[k], reverse=True)[:resto]:
        interi[k] += 1
    return interi


def vista(c: Composizione) -> dict:
    """La composizione per l'API e per la riga di comando: valori con lo strato accanto."""
    return {
        "strati": c.strati,
        "campi": {k: {kk: vv for kk, vv in v.items() if kk != "prima" or vv is not None} for k, v in c.campi.items()},
        "elenchi": {k: v for k, v in c.elenchi.items() if v},
        "atteggiamento": {"frequenze": c.atteggiamento["frequenze"], "storia": c.atteggiamento["storia"]},
        "canone": c.canone,
        "motivo_richiesto": c.motivo_richiesto,
        "avvisi": c.avvisi,
        "errori": c.errori,
    }


def copia(c: Composizione) -> Composizione:
    return deepcopy(c)
