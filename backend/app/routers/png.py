"""Sezione PNG: preset componibili, schede semplificate, comparse (solo Master).

I preset sono file YAML in `backend/png/` che il Master ritocca con un editor: qui si leggono e basta, giocando non
si modificano mai. Le schede nate dai preset stanno nella tabella `npcs` (la stessa dell'archivio PNG), con nome e
livello nelle colonne e il resto in `scheda`. Vita e danno non si salvano: «combattimento» li calcola al momento.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..auth import require_master
from ..db import get_db
from ..models import Campaign, Npc
from ..png import controlla as K
from ..png import dati as D
from ..png import genera as G
from ..png.componi import ErroreStrato, componi, vista
from ..serialize import npc_out, scheda_di

router = APIRouter(prefix="/api/png", tags=["png"], dependencies=[Depends(require_master)])


class Strati(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ruolo: str = Field(max_length=60)
    eta: str = Field("adulto", max_length=30)
    razza: str = Field("umano", max_length=60)
    regno: str | None = Field(None, max_length=60)
    insediamento: str | None = Field(None, max_length=30)
    zona: str | None = Field(None, max_length=80)
    ritocchi: list[str] = Field(default_factory=list, max_length=20)

    def luogo(self) -> dict:
        return {k: v for k, v in (("regno", self.regno), ("insediamento", self.insediamento), ("zona", self.zona)) if v}


class NuovoIn(Strati):
    seme: int | None = Field(None, ge=1, le=2**31)
    salva: bool = False
    partita: str | None = Field(None, max_length=40)


class ComparseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    regno: str | None = Field(None, max_length=60)
    insediamento: str | None = Field(None, max_length=30)
    zona: str | None = Field(None, max_length=80)
    quante: int = Field(5, ge=1, le=30)
    ruoli: list[str] | None = Field(None, max_length=20)
    seme: int | None = Field(None, ge=1, le=2**31)
    salva: bool = False


class AggiornaIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    partita: str | None = Field(None, max_length=40)
    giorno: int | None = Field(None, ge=0)
    affinita: int | None = Field(None, ge=-20, le=20)
    eccezione: bool = False
    prima_impressione: bool = False
    motivo: str = Field("", max_length=500)
    memoria: list[str] = Field(default_factory=list, max_length=20)
    legami: list[str] = Field(default_factory=list, max_length=20)
    morto: str | None = Field(None, max_length=300)


# Campi della scheda che il Master riscrive a mano (le rose pescate sono spunti da riscrivere sul posto)
CAMPI_SCRIVIBILI = {"vuole", "teme", "difetto", "forestieri", "prezzo", "vita", "contraddizione", "voce", "tratti",
                    "sa", "dicerie", "puo_dare", "conta", "perche_qui", "motivo", "corporatura", "addestramento",
                    "profilo", "mestiere", "ricchezza", "genere", "eta", "ritratto"}


class SchedaPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str | None = Field(None, min_length=1, max_length=100)
    livello: int | None = Field(None, ge=1, le=999)
    campi: dict[str, Any] = Field(default_factory=dict)


def _errore(x: Exception) -> HTTPException:
    return HTTPException(422, str(x))


def _partita(db: Session, partita: str | None) -> str:
    if partita:
        return partita
    c = db.scalar(select(Campaign).order_by(Campaign.id))
    return str(c.id) if c else "1"


def _usati(db: Session) -> set[str]:
    return {n for n in db.scalars(select(Npc.name))}


def _npc(db: Session, npc_id: int) -> Npc:
    n = db.get(Npc, npc_id)
    if n is None:
        raise HTTPException(404, "PNG non trovato.")
    if not n.scheda:
        raise HTTPException(409, "Questo PNG è stato scritto a mano prima della sezione PNG: non ha una scheda dai preset.")
    return n


def _salva(db: Session, s: dict, n: Npc | None = None) -> Npc:
    """Nome e livello nelle colonne, il resto in `scheda`."""
    resto = {k: v for k, v in s.items() if k not in ("nome", "livello", "dettaglio", "db_id")}
    if n is None:
        n = Npc(name=s["nome"][:100], level=int(s.get("livello") or 1), history=[])
        db.add(n)
    else:
        n.name, n.level = s["nome"][:100], int(s.get("livello") or 1)
    n.race = str(s.get("razza") or "")[:100]
    n.role = str(s.get("ruolo") or "")[:200]
    n.place = str(s.get("luogo") or "")[:200]
    n.dettaglio = s.get("dettaglio") or "scheda"
    n.scheda = resto
    flag_modified(n, "scheda")
    return n


@router.get("/catalogo")
def catalogo():
    cat = D.catalogo()
    def voci(d):
        return [{"nome": k, "descrizione": (f.dati or {}).get("descrizione"), "eredita": (f.dati or {}).get("eredita")}
                for k, f in d.items()]
    return {"ruoli": voci(cat.ruoli), "eta": voci(cat.eta), "razze": voci(cat.razze),
            "regni": [{"nome": k, "titolo": (v or {}).get("nome")} for k, v in (cat.regni.dati or {}).items()],
            "insediamenti": list(D.INSEDIAMENTI),
            "zone": [{"nome": k, "titolo": (v or {}).get("nome"), "regno": (v or {}).get("regno"),
                      "insediamento": (v or {}).get("insediamento")} for k, v in (cat.zone.dati or {}).items()],
            "modello_numeri": (cat.regole.dati or {}).get("modello_numeri_png")}


@router.post("/componi")
def componi_preset(data: Strati):
    try:
        return vista(componi(data.ruolo, data.eta, data.razza, data.luogo(), data.ritocchi))
    except ErroreStrato as x:
        raise _errore(x)


@router.get("/confronta/{ruolo}")
def confronta(ruolo: str, regno: str = "valeria", insediamento: str = "villaggio"):
    try:
        return G.confronta(ruolo, {"regno": regno, "insediamento": insediamento})
    except ErroreStrato as x:
        raise _errore(x)


@router.post("/nuovo")
def nuovo(data: NuovoIn, db: Session = Depends(get_db)):
    """Compone, pesca e propone una scheda. Con `salva` (in partita) la salva subito come bozza."""
    try:
        out = G.nuovo(data.ruolo, data.eta, data.razza, data.luogo(), data.ritocchi, data.seme, _usati(db))
    except ErroreStrato as x:
        raise _errore(x)
    if out["scheda"] is None:
        raise HTTPException(422, {"errori": out["errori"], "avvisi": out["avvisi"]})
    if data.salva:
        s = out["scheda"]
        s["stato"] = {_partita(db, data.partita): dict(s["stato_iniziale"])}
        n = _salva(db, s)
        db.commit()
        out["npc"] = npc_out(n)
    return out


@router.post("/comparse")
def comparse(data: ComparseIn, db: Session = Depends(get_db)):
    luogo = {k: v for k, v in (("regno", data.regno), ("insediamento", data.insediamento), ("zona", data.zona)) if v}
    try:
        out = G.comparse(luogo, data.quante, data.ruoli, data.seme, _usati(db))
    except ErroreStrato as x:
        raise _errore(x)
    if data.salva:
        out["npc"] = []
        for r in out["comparse"]:
            n = Npc(name=r["nome"][:100], level=r["livello"], race=r["razza"], role=r["ruolo"],
                    place=r["provenienza"]["luogo"], history=[], dettaglio="comparsa",
                    scheda={k: v for k, v in r.items() if k not in ("nome", "livello", "dettaglio")})
            db.add(n)
            out["npc"].append(n)
        db.commit()
        out["npc"] = [npc_out(n) for n in out["npc"]]
    return out


@router.get("/schede")
def schede(luogo: str | None = None, db: Session = Depends(get_db)):
    q = select(Npc).where(Npc.scheda.is_not(None)).order_by(Npc.id)
    out = [npc_out(n) for n in db.scalars(q)]
    return [x for x in out if not luogo or (x["place"] or "").startswith(luogo)]


@router.patch("/schede/{npc_id}")
def ritocca(npc_id: int, data: SchedaPatch, db: Session = Depends(get_db)):
    """Riscrive a mano i campi di una scheda (le rose pescate sono spunti). Mai i valori derivati."""
    n = _npc(db, npc_id)
    fuori = [k for k in data.campi if k not in CAMPI_SCRIVIBILI]
    if fuori:
        raise HTTPException(422, f"Campi non modificabili qui: {', '.join(fuori)}. "
                                 "Vita e danno non si scrivono: si calcolano con «combattimento».")
    s = scheda_di(n)
    s.update(data.campi)
    for k in data.campi:
        if k in (s.get("da_ritoccare") or []):
            s["da_ritoccare"].remove(k)
        s.setdefault("origine", {})[k] = "ritocco a mano"
    if data.nome:
        s["nome"] = data.nome
    if data.livello:
        s["livello"] = data.livello
        s["origine"]["livello"] = "ritocco a mano"
    _salva(db, s, n)
    db.commit()
    avvisi = K.controlla_schede([scheda_di(n)]).vista()
    return {"npc": npc_out(n), **avvisi}


@router.get("/schede/{npc_id}/combattimento")
def combattimento(npc_id: int, db: Session = Depends(get_db)):
    """Calcolato dai dati della scheda, non salvato."""
    return G.combattimento(scheda_di(_npc(db, npc_id)))


@router.post("/schede/{npc_id}/promuovi")
def promuovi(npc_id: int, db: Session = Depends(get_db)):
    n = _npc(db, npc_id)
    out = G.promuovi(scheda_di(n), _usati(db) - {n.name})
    if out["errori"]:
        raise HTTPException(422, {"errori": out["errori"], "avvisi": out["avvisi"]})
    _salva(db, out["scheda"], n)
    db.commit()
    return {"npc": npc_out(n), "avvisi": out["avvisi"]}


@router.post("/schede/{npc_id}/aggiorna")
def aggiorna(npc_id: int, data: AggiornaIn, db: Session = Depends(get_db)):
    """Dopo una sessione: affinità, memoria, legami, stato. Non tocca mai i preset."""
    n = _npc(db, npc_id)
    if n.dettaglio == "comparsa":
        raise HTTPException(409, "Una comparsa non ha stato: promuovila a scheda.")
    ev = data.model_dump(exclude={"partita"})
    out = G.aggiorna(scheda_di(n), _partita(db, data.partita), ev)
    _salva(db, out["scheda"], n)
    db.commit()
    return {"npc": npc_out(n), "avvisi": out["avvisi"]}


@router.get("/schede/{npc_id}/riga")
def riga(npc_id: int, db: Session = Depends(get_db)):
    return G.riga_zona(scheda_di(_npc(db, npc_id)))


@router.get("/controlla")
def controlla(db: Session = Depends(get_db)):
    schede = [scheda_di(n) for n in db.scalars(select(Npc).where(Npc.scheda.is_not(None)))]
    return K.controlla(schede)
