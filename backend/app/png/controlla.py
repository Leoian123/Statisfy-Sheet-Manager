"""Controlli su preset e schede, e prove sui PNG già scritti.

Errori (bloccano): chiave fuori schema, campo obbligatorio mancante, rosa vuota, frequenze che non sommano a 100,
valore derivato scritto a mano, fascia oltre il 99 senza FONTE, bambino con mestiere o combattimento, riferimento
a un documento, a un preset o a una voce di Taratura che non esiste.
Avvisi: livello nel terzo alto senza motivo, adulto qualunque sopra gli anni, razza rara senza un perché, due PNG
dello stesso luogo con lo stesso difetto e la stessa voce, ritocco che sfonda un limite, ogni PROPOSTA e ogni null.
"""
from __future__ import annotations

import difflib
import math
import re
from pathlib import Path
from typing import Any

import yaml

from . import dati as D
from .componi import ErroreStrato, componi, fascia_da_anni, interseca
from .genera import combattimento, controlla_livello, terzo_alto

# Documenti a cui un commento FONTE può rimandare: alias → file in statisfy/
ALIAS_DOCUMENTI = {
    "Zona_Alba_Chiara": "claude/Zona_Alba_Chiara.txt",
    "Alba Chiara": "claude/Zona_Alba_Chiara.txt",
    "Taratura": "claude/Taratura_PNG_e_Giocatori.txt",
    "Note_di_stile": "claude/Note_di_stile_narratore.txt",
    "Discrepanze_da_risolvere": "claude/Discrepanze_da_risolvere.txt",
    "Sistema_PNG": "Sistema_PNG_Completo.txt",
    "Status Sociale": "Sistema_Status_Sociale.txt",
    "Progressione": "Progressione_Personaggio_Completo.txt",
    "Combat.txt": "Combat.txt",
    "Crafting": "Crafting and Equip system.txt",
    "Ambientazione.txt": "Ambientazione.txt",
    "Supplemento Impero Celeste": "Supplemento_Ambientazione_-_Impero_Celeste.txt",
    "Supplemento Ambientazione - La moneta a tre facce": "Supplemento Ambientazione - La moneta a tre facce.txt",
    "Supplemento.txt": "Supplemento.txt",
    "Sistema_Narrativo": "Sistema_Narrativo_Completo.txt",
    "Master_System": "Master_System_v4.txt",
}
# Documenti con le sezioni numerate citate come «§N»
SEZIONI = {"Taratura": "claude/Taratura_PNG_e_Giocatori.txt", "Sistema_PNG": "Sistema_PNG_Completo.txt",
           "Status Sociale": "Sistema_Status_Sociale.txt", "Progressione": "Progressione_Personaggio_Completo.txt",
           "Sistema_Narrativo": "Sistema_Narrativo_Completo.txt"}
OP_ELENCO = {"solo", "togli", "aggiungi"}


def _sezioni(rel: str) -> int | None:
    p = D.DOCUMENTI / rel
    if not p.exists():
        return None
    return len(re.findall(r"^## SEZIONE \d+", p.read_text(encoding="utf-8"), flags=re.M)) or None


def _suggerisci(chiave: str, ammesse) -> str:
    s = difflib.get_close_matches(str(chiave), sorted(ammesse), n=1)
    return f" (forse «{s[0]}»?)" if s else ""


def _voci(v) -> list[str]:
    """Le voci di un elenco, qualunque sia la forma: [..], {solo: [..]}, {aggiungi: [..], togli: [..]}."""
    if isinstance(v, list):
        return [str(x) for x in v]
    if isinstance(v, dict):
        return [str(x) for k in OP_ELENCO for x in (v.get(k) or [])]
    return [] if v is None else [str(v)]


class Esito:
    def __init__(self):
        self.errori: list[dict] = []
        self.avvisi: list[dict] = []

    def errore(self, dove: str, testo: str) -> None:
        self.errori.append({"dove": dove, "testo": testo})

    def avviso(self, dove: str, testo: str, genere: str = "avviso") -> None:
        self.avvisi.append({"dove": dove, "testo": testo, "genere": genere})

    def vista(self) -> dict:
        return {"errori": self.errori, "avvisi": self.avvisi}


# ---------------------------------------------------------------------------------------------------------------
# Preset
# ---------------------------------------------------------------------------------------------------------------
def _strato(e: Esito, cat: D.Catalogo, f: D.File, base: tuple, d: dict, genere: str) -> None:
    ammesse = D.SCHEMA[genere]
    regole = cat.regole.dati or {}
    for k, v in (d or {}).items():
        p = base + (k,)
        if k not in ammesse:
            e.errore(f.dove(*p), f"chiave «{k}» fuori schema{_suggerisci(k, ammesse)}")
            continue
        if k in D.SCALE and k != "profilo" and v is not None:
            ok = (isinstance(v, dict) and set(v) <= {"sposta"}) or v in D.SCALE[k] or \
                 (k == "ricchezza" and isinstance(v, list) and all(x in D.SCALE[k] for x in v))
            if not ok:
                e.errore(f.dove(*p), f"{k}: «{v}» non è un valore ammesso ({', '.join(D.SCALE[k])})")
        if k == "profilo" and isinstance(v, dict):
            for s, x in v.items():
                if s not in D.STATISTICHE:
                    e.errore(f.dove(*p, s), f"statistica «{s}» sconosciuta{_suggerisci(s, D.STATISTICHE)}")
                elif not (x in D.SCALE["profilo"] or (isinstance(x, dict) and set(x) <= {"sposta"})):
                    e.errore(f.dove(*p, s), f"profilo {s}: «{x}» (bassa, media, alta)")
        if k == "numeri" and isinstance(v, dict):
            _strato(e, cat, f, p, v, "variante")
        if k == "mestiere" and isinstance(v, dict):
            g = v.get("grado")
            if isinstance(g, list) and not all(str(x) in D.GRADI for x in g):
                e.errore(f.dove(*p, "grado"), f"grado {g}: i gradi vanno da I a X (Progressione §4)")
        if k == "conta" and v not in (regole.get("conta") or {}):
            e.errore(f.dove(*p), f"conta «{v}» sconosciuta{_suggerisci(v, regole.get('conta') or {})}")
        if k == "atteggiamento" and isinstance(v, dict):
            for a in v:
                if a not in D.ATTEGGIAMENTI:
                    e.errore(f.dove(*p, a), f"atteggiamento «{a}» sconosciuto{_suggerisci(a, D.ATTEGGIAMENTI)}")
        if k == "rose":
            if not isinstance(v, dict):
                e.errore(f.dove(*p), "rose: serve un elenco per ciascuna rosa")
                continue
            for r, x in v.items():
                if r not in D.ROSE:
                    e.errore(f.dove(*p, r), f"rosa «{r}» fuori schema{_suggerisci(r, D.ROSE)}")
                _elenco(e, f, p + (r,), x, rosa=True)
        if k in D.ELENCHI:
            _elenco(e, f, p, v, rosa=False)
            ref = {"no_tipici": ("motivi_no", "Taratura §5"), "malizia": ("malizia", "Taratura §6")}.get(k)
            if ref:
                ammessi = regole.get(ref[0]) or []
                for x in _voci(v):
                    if x not in ammessi:
                        e.errore(f.dove(*p), f"{k}: «{x}» non è una voce di {ref[1]}{_suggerisci(x, ammessi)}")
        if k == "varianti_razza" and isinstance(v, dict):
            for razza, var in v.items():
                if razza not in cat.razze:
                    e.errore(f.dove(*p, razza), f"variante per la razza «{razza}», che non esiste{_suggerisci(razza, cat.razze)}")
                _strato(e, cat, f, p + (razza,), var or {}, "variante")
        if k == "eredita":
            b = cat.ruoli.get(v)
            if b is None:
                e.errore(f.dove(*p), f"eredita da «{v}», che non esiste{_suggerisci(v, cat.ruoli)}")
            elif (b.dati or {}).get("eredita"):
                e.errore(f.dove(*p), f"«{v}» eredita a sua volta: un preset si deve capire leggendo al massimo due file")


def _elenco(e: Esito, f: D.File, p: tuple, v, rosa: bool) -> None:
    if isinstance(v, dict):
        for op in v:
            if op not in OP_ELENCO:
                e.errore(f.dove(*p, op), f"operazione «{op}» sconosciuta (solo, aggiungi, togli){_suggerisci(op, OP_ELENCO)}")
        if rosa and "solo" in v and not v["solo"]:
            e.errore(f.dove(*p), "rosa vuota")
    elif isinstance(v, list):
        if rosa and not v:
            e.errore(f.dove(*p), "rosa vuota")
        if len(v) > 8:
            e.avviso(f.dove(*p), f"{len(v)} voci: una rosa si legge in un colpo d'occhio con quattro-otto voci")


def _derivati(e: Esito, f: D.File, d: Any, p: tuple = ()) -> None:
    if isinstance(d, dict):
        for k, v in d.items():
            if k in D.DERIVATI:
                e.errore(f.dove(*p, k), f"«{k}» è un valore derivato: non si scrive a mano, si calcola da app.rules")
            _derivati(e, f, v, p + (k,))
    elif isinstance(d, list):
        for i, v in enumerate(d):
            _derivati(e, f, v, p + (i,))


def _null(e: Esito, f: D.File, d: Any, p: tuple = ()) -> None:
    if isinstance(d, dict):
        for k, v in d.items():
            if v is None:
                e.avviso(f.dove(*p, k), f"{'.'.join(map(str, p + (k,)))}: null (i documenti non lo dicono)", "null")
            else:
                _null(e, f, v, p + (k,))


def _fasce(e: Esito, cat: D.Catalogo, f: D.File, fasce: dict, p: tuple) -> None:
    tetto = int((cat.regole.dati or {}).get("gente_comune_max") or 99)
    for ins, fa in (fasce or {}).items():
        if ins not in D.INSEDIAMENTI:
            e.errore(f.dove(*p, ins), f"insediamento «{ins}» sconosciuto{_suggerisci(ins, D.INSEDIAMENTI)}")
            continue
        if fa is None:
            continue
        if not (isinstance(fa, list) and len(fa) == 2 and all(isinstance(x, int) for x in fa) and fa[0] <= fa[1]):
            e.errore(f.dove(*p, ins), f"fascia {fa}: serve [minimo, massimo]")
            continue
        if fa[1] > tetto and "FONTE" not in f.nota(*p, ins):
            e.errore(f.dove(*p, ins), f"fascia {fa[0]}-{fa[1]} oltre il {tetto} senza una FONTE accanto")


def _commenti(e: Esito, f: D.File) -> None:
    for riga, c in sorted(f.commenti.items()):
        if riga in f.intestazioni:
            continue
        dove = f"{f.rel}:{riga}"
        if "PROPOSTA" in c:
            e.avviso(dove, c, "proposta")
        if "FONTE" in c:
            dopo = c[c.index("FONTE"):]
            if not any(a in dopo for a in ALIAS_DOCUMENTI):
                e.errore(dove, f"FONTE senza un documento riconoscibile: «{c}»")
        for a, rel in ALIAS_DOCUMENTI.items():
            if a in c and D.DOCUMENTI.exists() and not (D.DOCUMENTI / rel).exists():
                e.errore(dove, f"il documento «{rel}» non esiste")
        for a, rel in SEZIONI.items():
            for m in re.finditer(re.escape(a) + r"[^§\n]{0,12}§\s*(\d+)", c):
                n = _sezioni(rel)
                if n and int(m[1]) > n:
                    e.errore(dove, f"{a} §{m[1]}: la sezione non esiste ({rel} ne ha {n})")


def controlla_preset(cat: D.Catalogo | None = None) -> Esito:
    cat = cat or D.catalogo()
    e = Esito()
    for x in cat.errori_lettura:
        e.errore(x.split(":")[0], x)
    reg = cat.regole.dati or {}
    for genere, nome, f in cat.tutti():
        _commenti(e, f)
        if genere != "regole":   # regole.yaml tiene parametri (moltiplicatori), non valori
            _derivati(e, f, f.dati)
        _null(e, f, f.dati)
        if genere in ("eta", "ruoli", "razze"):
            _strato(e, cat, f, (), f.dati, genere)
            for k in D.OBBLIGATORI.get(genere, []):
                if k not in (f.dati or {}):
                    e.errore(f.rel, f"manca il campo obbligatorio «{k}»")
        elif genere in ("regole",):
            for k in (f.dati or {}):
                if k not in D.SCHEMA["regole"]:
                    e.errore(f.dove(k), f"chiave «{k}» fuori schema{_suggerisci(k, D.SCHEMA['regole'])}")
        else:
            for voce, d in (f.dati or {}).items():
                for k in (d or {}):
                    if k not in D.SCHEMA[genere]:
                        e.errore(f.dove(voce, k), f"chiave «{k}» fuori schema{_suggerisci(k, D.SCHEMA[genere])}")
        if genere == "ruoli":
            _fasce(e, cat, f, (f.dati or {}).get("livello"), ("livello",))
    # regole
    pc = reg.get("primo_contatto") or {}
    if sum(float(v) for v in pc.values()) != 100:
        e.errore(cat.regole.dove("primo_contatto"), f"le frequenze di primo contatto sommano a {sum(pc.values())}, non a 100")
    for a in pc:
        if a not in D.ATTEGGIAMENTI:
            e.errore(cat.regole.dove("primo_contatto", a), f"atteggiamento «{a}» sconosciuto{_suggerisci(a, D.ATTEGGIAMENTI)}")
    # regni e zone
    valute = reg.get("valute") or {}
    for r, d in (cat.regni.dati or {}).items():
        d = d or {}
        if d.get("moneta") and d["moneta"] not in valute:
            e.errore(cat.regni.dove(r, "moneta"), f"moneta «{d['moneta']}» assente da regole.valute")
        for razza in (d.get("popoli") or {}):
            if razza not in cat.razze:
                e.errore(cat.regni.dove(r, "popoli", razza), f"razza «{razza}» senza file in preset/razze")
        for ruolo, fasce in (d.get("fasce_ruoli") or {}).items():
            if ruolo not in cat.ruoli:
                e.errore(cat.regni.dove(r, "fasce_ruoli", ruolo), f"ruolo «{ruolo}» sconosciuto")
            _fasce(e, cat, cat.regni, fasce, (r, "fasce_ruoli", ruolo))
    for z, d in (cat.zone.dati or {}).items():
        d = d or {}
        if d.get("regno") not in (cat.regni.dati or {}):
            e.errore(cat.zone.dove(z, "regno"), f"regno «{d.get('regno')}» sconosciuto")
        if d.get("insediamento") not in D.INSEDIAMENTI:
            e.errore(cat.zone.dove(z, "insediamento"), f"insediamento «{d.get('insediamento')}» sconosciuto")
    # ogni ruolo porta agganci: almeno una cosa da dare e un motivo per dire no (criterio 5); tetto degli atteggiamenti
    for ruolo, f in cat.ruoli.items():
        for eta in cat.eta:
            try:
                c = componi(ruolo, eta, "umano", {"regno": "valeria", "insediamento": "villaggio"}, None, cat)
            except ErroreStrato:
                continue
            for r in ("vuole", "teme", "difetto", "forestieri", "prezzo", "vita"):
                if not c.elenchi.get(r):
                    e.errore(f.rel, f"{ruolo} · {eta}: la rosa «{r}» composta è vuota")
        for razza in cat.razze:
            try:
                c = componi(ruolo, "adulto", razza, {"regno": "valeria", "insediamento": "villaggio"}, None, cat)
            except ErroreStrato as x:
                e.errore(f.rel, str(x))
                break
            for a in c.avvisi:
                if "tetto" in a:
                    e.avviso(f.rel, f"{ruolo} · {razza}: {a}")
            if razza == "umano":
                if not c.elenchi.get("puo_dare"):
                    e.errore(f.rel, f"{ruolo}: nessuna cosa che il forestiero può ottenere (puo_dare)")
                if not c.elenchi.get("no_tipici"):
                    e.errore(f.rel, f"{ruolo}: nessun motivo tipico per dire no (no_tipici)")
    return e


# ---------------------------------------------------------------------------------------------------------------
# Schede
# ---------------------------------------------------------------------------------------------------------------
def _luogo_di(s: dict) -> dict:
    p = s.get("provenienza") or {}
    regno, _, resto = (p.get("luogo") or s.get("luogo") or "").partition("/")
    out = {"regno": regno, "insediamento": p.get("insediamento")}
    if resto and resto not in D.INSEDIAMENTI:
        out["zona"] = resto
    return out


def controlla_schede(schede: list[dict], cat: D.Catalogo | None = None) -> Esito:
    cat = cat or D.catalogo()
    e = Esito()
    visti: dict[tuple, str] = {}
    for s in schede:
        if not s or s.get("dettaglio") == "comparsa":
            continue
        try:
            _scheda(e, s, cat, visti)
        except (TypeError, ValueError, KeyError, AttributeError):
            e.errore(f"scheda {s.get('id') or s.get('nome', '?')}", f"{s.get('nome', '?')}: scheda illeggibile, va riscritta a mano")
    return e


def _scheda(e: Esito, s: dict, cat: D.Catalogo, visti: dict) -> None:
    nome = s.get("nome", "?")
    dove = f"scheda {s.get('id') or nome}"
    f = D.File(rel=dove, dati=s)
    _derivati(e, f, {k: v for k, v in s.items() if k not in ("stato", "stato_iniziale")})
    p = s.get("provenienza") or {}
    ritocchi = " ".join(p.get("ritocchi") or []).lower()
    fase = (s.get("eta") or {}).get("fase")
    if fase == "bambino":
        if s.get("mestiere"):
            (e.avviso if "mestiere" in ritocchi else e.errore)(dove, f"{nome}: un bambino con un mestiere")
        if (s.get("addestramento") or "nessuno") != "nessuno":
            (e.avviso if "addestramento" in ritocchi else e.errore)(dove, f"{nome}: un bambino con un blocco di combattimento")
    fascia = None
    if p.get("ruolo") and p.get("eta") and p.get("razza"):
        try:
            c = componi(p["ruolo"], p["eta"], p["razza"], _luogo_di(s), None, cat)
            fascia = c.valore("livello")
            if c.valore("livello_da_anni") and (s.get("eta") or {}).get("apparente"):
                a = int(s["eta"]["apparente"])
                fascia, _ = interseca(fascia, fascia_da_anni([a, a], c.valore("livello_da_anni")))
            if c.valore("rara_nel_luogo") and not s.get("perche_qui"):
                e.avviso(dove, f"{nome}: {p['razza']} è rara nel luogo e la scheda non dice perché è lì")
        except ErroreStrato as x:
            e.errore(dove, f"{nome}: {x}")
    for a in controlla_livello(s, fascia, cat):
        e.avviso(dove, a)
    chiave = (s.get("luogo"), s.get("difetto"), s.get("voce"))
    if all(chiave) and chiave in visti:
        e.avviso(dove, f"{nome} e {visti[chiave]}: stesso luogo, stesso difetto e stessa voce")
    visti.setdefault(chiave, nome)


# ---------------------------------------------------------------------------------------------------------------
# Prove sui PNG già scritti
# ---------------------------------------------------------------------------------------------------------------
def prove(cat: D.Catalogo | None = None) -> list[dict]:
    cat = cat or D.catalogo()
    p = D.RADICE / "prove.yaml"
    if not p.exists():
        return []
    out = []
    for pr in yaml.safe_load(p.read_text(encoding="utf-8")) or []:
        out.append(prova(pr, cat))
    return out


def prova(pr: dict, cat: D.Catalogo) -> dict:
    k = pr.get("componi") or {}
    luogo = {x: k[x] for x in ("regno", "insediamento", "zona") if k.get(x)}
    ritocchi = list(pr.get("ritocchi") or [])
    note: list[str] = []
    try:
        c = componi(k.get("ruolo"), k.get("eta"), k.get("razza"), luogo, ritocchi, cat)
    except ErroreStrato as x:
        return _esito(pr, "fallisce", [str(x)])
    if c.errori:
        return _esito(pr, "motivo" if c.motivo_richiesto else "fallisce", c.errori)
    avvisi = list(c.avvisi)
    lv = pr.get("livello")
    motivo = bool(c.ritocchi["motivi"])
    if lv is not None:
        lv = int(lv)
        da_anni = c.valore("livello_da_anni")
        if da_anni and "livello" not in c.ritocchi:
            # il livello segue gli anni: per quali anni della fase questo livello è possibile?
            base = c.campi["livello"].get("prima") or c.valore("livello")
            anni_f = c.valore("anni")
            possibili = [a for a in range(anni_f[0], anni_f[1] + 1)
                         if (lambda f: f[0] <= lv <= f[1])(interseca(base, fascia_da_anni([a, a], da_anni))[0])]
            if not possibili:
                return _esito(pr, "fallisce", [f"livello {lv} impossibile per un {k.get('eta')} di {anni_f[0]}-{anni_f[1]} anni"])
            note.append("con queste regole ha " + " o ".join(map(str, possibili)) + " anni")
        else:
            fascia = c.valore("livello")
            if "livello" in c.ritocchi:
                fascia = c.campi["livello"].get("prima") or fascia
            if fascia and not (fascia[0] <= lv <= fascia[1]) and "livello" not in c.ritocchi:
                return _esito(pr, "fallisce", [f"livello {lv} fuori dalla fascia {fascia[0]}-{fascia[1]}"])
            if fascia and terzo_alto(fascia, lv):
                if motivo:
                    note.append(f"terzo alto della fascia {fascia[0]}-{fascia[1]}, motivo: {'; '.join(c.ritocchi['motivi'])}")
                else:
                    avvisi.append(f"livello {lv} nel terzo alto della fascia {fascia[0]}-{fascia[1]} senza un motivo")
            anni = pr.get("anni")
            if anni and k.get("eta") == "adulto" and lv > int(anni) and not motivo:
                avvisi.append(f"adulto qualunque con il livello ({lv}) sopra gli anni ({anni})")
    if k.get("eta") == "bambino":
        if c.valore("mestiere.nome"):
            return _esito(pr, "fallisce", ["il bambino esce con un mestiere"])
        cb = combattimento({"livello": lv or 1, "eta": {"fase": "bambino"}, "addestramento": c.valore("addestramento")}, cat)
        if cb.get("combatte"):
            return _esito(pr, "fallisce", ["il bambino esce con un blocco di combattimento"])
        note.append("niente mestiere, niente combattimento")
    return _esito(pr, "avviso" if avvisi else "passa", avvisi, note)


def _esito(pr: dict, esito: str, dettagli: list[str], note: list[str] | None = None) -> dict:
    atteso = pr.get("atteso", "passa")
    return {"nome": pr.get("nome"), "prova": pr.get("prova"), "atteso": atteso, "esito": esito,
            "ok": esito == atteso, "dettagli": dettagli, "note": note or []}


def controlla(schede: list[dict] | None = None, cat: D.Catalogo | None = None) -> dict:
    cat = cat or D.catalogo()
    p = controlla_preset(cat)
    s = controlla_schede(schede or [], cat)
    pr = prove(cat)
    return {"errori": p.errori + s.errori, "avvisi": p.avvisi + s.avvisi, "prove": pr,
            "prove_ok": all(x["ok"] for x in pr)}
