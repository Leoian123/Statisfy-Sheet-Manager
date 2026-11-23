"""Lettura dei preset dei PNG (file YAML in `backend/png/`, scritti a mano dal Master).

Ogni file è letto due volte: i dati (yaml.safe_load) e la posizione delle chiavi (yaml.compose), così ogni valore
sa da quale riga viene e quale commento ha accanto (FONTE o PROPOSTA). Nessun valore derivato vive qui: Vita, danno,
scala di potere e punti di level up si leggono da `app.rules`.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

RADICE = Path(os.environ.get("STATISFY_PNG_DIR") or Path(__file__).resolve().parents[2] / "png")
DOCUMENTI = Path(__file__).resolve().parents[3] / "statisfy"

# ---------------------------------------------------------------------------------------------------------------
# Schema: le chiavi ammesse per ogni genere di file. Una chiave fuori schema è un errore (di solito un refuso).
# ---------------------------------------------------------------------------------------------------------------
ROSE = ["vuole", "teme", "difetto", "forestieri", "prezzo", "vita", "tratti", "intercalare"]
ELENCHI = ["dove", "sa", "dicerie", "puo_dare", "no_tipici", "malizia", "segni", "limiti", "usanze", "capacita",
           "legami_tipici"]
TESTI = ["descrizione", "giornata", "voce", "compito", "note"]
SCALE = {
    "corporatura": ["fragile", "normale", "robusta"],
    "addestramento": ["nessuno", "improvvisato", "addestrato", "veterano"],
    "profilo": ["bassa", "media", "alta"],
    "ricchezza": ["povero", "modesto", "agiato", "ricco"],
}
STATISTICHE = ["STR", "DEX", "VIT", "INT"]
ATTEGGIAMENTI = ["ostile", "diffidente", "indifferente", "interessato", "ben_disposto"]
INSEDIAMENTI = ["villaggio", "citta", "metropoli"]
GRADI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]

STRATO = {"rose", *ELENCHI, *TESTI, "corporatura", "addestramento", "profilo", "mestiere", "ricchezza", "conta",
          "atteggiamento", "canone"}
SCHEMA = {
    "ruoli": STRATO | {"eredita", "livello", "varianti_razza"},
    "variante": STRATO | {"richiede_motivo"},
    "eta": STRATO | {"anni", "livello"},
    "razze": STRATO | {"nome_nei_documenti", "dove_vive", "longevita", "fase_della_vita", "numeri",
                       "conta_per_i_suoi", "nomi", "tacciono"},
    "regole": {"modello_numeri_png", "rarita_png", "corporatura", "addestramento", "profilo", "arma_modello_personaggio",
               "longevita", "gente_comune_max", "livello", "primo_contatto", "tetto_atteggiamento", "scena",
               "affinita", "conta", "difetti", "motivi_no", "malizia", "ricchezza", "valute", "ranghi_mestiere",
               "dettaglio", "promozione", "anni_massimi"},
    "insediamenti": {"abitanti", "voci", "esempio"},
    "regni": {"nome", "capitale", "moneta", "culto", "popoli", "conta", "fascia_gente_comune", "fasce_ruoli", "nomi"},
    "zone": {"nome", "fonte", "regno", "insediamento", "forestieri", "affinita_iniziale", "luoghi", "usanze", "prezzi",
             "nomi_usati"},
}
OBBLIGATORI = {
    "ruoli": ["descrizione", "livello"],
    "eta": ["descrizione", "anni", "livello"],
    "razze": ["dove_vive", "longevita", "tacciono"],
}
# Chiavi che sarebbero valori derivati: non si scrivono mai a mano (si calcolano da app.rules).
DERIVATI = {"Vita", "Mana", "Stamina", "danno", "Danno", "hp", "mp", "sp", "HP", "MP", "SP", "difesa"}


@dataclass
class File:
    """Un file YAML letto: dati, riga di ogni chiave e commento di ogni riga."""
    rel: str
    dati: Any
    righe: dict[tuple, int] = field(default_factory=dict)
    commenti: dict[int, str] = field(default_factory=dict)
    intestazioni: set[int] = field(default_factory=set)   # righe fatte solo di commento (spiegazioni, non note)

    def riga(self, *percorso) -> int | None:
        p = tuple(percorso)
        while p:
            if p in self.righe:
                return self.righe[p]
            p = p[:-1]
        return None

    def dove(self, *percorso) -> str:
        r = self.riga(*percorso)
        return f"{self.rel}:{r}" if r else self.rel

    def nota(self, *percorso) -> str:
        """FONTE o PROPOSTA scritta accanto alla chiave (o sulla chiave che la contiene)."""
        p = tuple(percorso)
        while p:
            r = self.righe.get(p)
            if r and self.commenti.get(r):
                return self.commenti[r]
            p = p[:-1]
        return ""


def _commento(riga: str) -> str:
    """Testo dopo il primo # che non sta fra virgolette doppie ed è preceduto da uno spazio (o a inizio riga)."""
    dentro = False
    for i, ch in enumerate(riga):
        if ch == '"':
            dentro = not dentro
        elif ch == "#" and not dentro and (i == 0 or riga[i - 1] in " \t"):
            return riga[i + 1:].strip()
    return ""


def _righe(nodo, percorso: tuple, out: dict) -> None:
    if isinstance(nodo, yaml.MappingNode):
        for k, v in nodo.value:
            p = percorso + (k.value,)
            out[p] = k.start_mark.line + 1
            _righe(v, p, out)
    elif isinstance(nodo, yaml.SequenceNode):
        for i, v in enumerate(nodo.value):
            p = percorso + (i,)
            out[p] = v.start_mark.line + 1
            _righe(v, p, out)


def leggi(percorso: Path) -> File:
    testo = percorso.read_text(encoding="utf-8")
    rel = percorso.relative_to(RADICE).as_posix()
    f = File(rel=rel, dati=yaml.safe_load(testo) or {})
    nodo = yaml.compose(testo)
    if nodo is not None:
        _righe(nodo, (), f.righe)
    righe = testo.splitlines()
    f.commenti = {i + 1: c for i, r in enumerate(righe) if (c := _commento(r))}
    f.intestazioni = {i + 1 for i, r in enumerate(righe) if r.lstrip().startswith("#")}
    return f


@dataclass
class Catalogo:
    regole: File
    eta: dict[str, File]
    ruoli: dict[str, File]
    razze: dict[str, File]
    insediamenti: File
    regni: File
    zone: File
    errori_lettura: list[str]

    def tutti(self) -> list[tuple[str, str, File]]:
        """(genere, nome, file) per ogni file letto."""
        out = [("regole", "regole", self.regole), ("insediamenti", "insediamenti", self.insediamenti),
               ("regni", "regni", self.regni), ("zone", "zone", self.zone)]
        for genere in ("eta", "ruoli", "razze"):
            out += [(genere, n, f) for n, f in getattr(self, genere).items()]
        return out


def _cartella(nome: str, errori: list[str]) -> dict[str, File]:
    out = {}
    for p in sorted((RADICE / "preset" / nome).glob("*.yaml")):
        try:
            out[p.stem] = leggi(p)
        except yaml.YAMLError as e:
            errori.append(f"{p.relative_to(RADICE).as_posix()}: YAML non valido — {e}")
    return out


def _uno(rel: str, errori: list[str]) -> File:
    p = RADICE / rel
    try:
        return leggi(p)
    except FileNotFoundError:
        errori.append(f"{rel}: file mancante")
    except yaml.YAMLError as e:
        errori.append(f"{rel}: YAML non valido — {e}")
    return File(rel=rel, dati={})


def _firma() -> tuple:
    """Data di modifica di tutti i file: se uno cambia, il catalogo si rilegge (ritocchi a caldo)."""
    return tuple(sorted((str(p), p.stat().st_mtime_ns) for p in RADICE.rglob("*.yaml")))


@lru_cache(maxsize=4)
def _carica(firma: tuple) -> Catalogo:
    errori: list[str] = []
    return Catalogo(
        regole=_uno("regole.yaml", errori),
        eta=_cartella("eta", errori), ruoli=_cartella("ruoli", errori), razze=_cartella("razze", errori),
        insediamenti=_uno("preset/luoghi/insediamenti.yaml", errori),
        regni=_uno("preset/luoghi/regni.yaml", errori),
        zone=_uno("preset/luoghi/zone.yaml", errori),
        errori_lettura=errori,
    )


def catalogo() -> Catalogo:
    return _carica(_firma())


def slug(testo: str) -> str:
    t = testo.lower()
    for a, b in (("à", "a"), ("è", "e"), ("é", "e"), ("ì", "i"), ("ò", "o"), ("ù", "u"), ("'", "-")):
        t = t.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")
