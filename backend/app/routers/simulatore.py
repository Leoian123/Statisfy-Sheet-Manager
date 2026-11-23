"""Simulatore di danno (solo Master): chi attacca, con quali abilità, contro chi. Nessuna scheda cambia.

Per ogni abilità il motore (`engine.preview`) calcola danno o cura minimo e massimo sul bersaglio; qui si aggiungono
la probabilità di colpire e di critico, il valore atteso per lancio, il costo, quanti lanci servono per abbatterlo
e la resa per punto di costo, per confrontare le abilità tra loro.
"""
from __future__ import annotations

import math
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from .. import engine as E
from .. import rules
from ..auth import require_master
from ..db import get_db
from ..models import Character
from .scontri import creature_combatants, pg_combatant

router = APIRouter(prefix="/api/simulatore", tags=["simulatore"], dependencies=[Depends(require_master)])

A, B = "att", "ber"
DAMAGE_TYPES = ["fisico", "magico", "Ignis", "Aqua", "Terra", "Ventus", "Mens", "Anima", "Vis", "Vita", "Spatium",
                "Tempus", "Luce", "Ombra", "Veleno"]


class Side(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: Literal["pg", "creatura", "voce"]
    id: int | None = None  # pg
    nome: str = Field("", max_length=60)
    level: int = Field(1, ge=0, le=9999)  # creatura
    rarity: str = Field("Comune", max_length=20)
    size: str = Field("Normale", max_length=20)
    hp: float = Field(10000, ge=1, le=1e12, allow_inf_nan=False)  # voce
    difesa: float = Field(0, ge=0, le=1e9, allow_inf_nan=False)
    evasione: float = Field(0, ge=0, le=95, allow_inf_nan=False)
    resistenza: float = Field(0, ge=0, le=100, allow_inf_nan=False)


class SimIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    attaccante: Side
    bersaglio: Side
    abilita: list[str] = Field(default_factory=list, max_length=60)  # vuoto = tutte quelle con numeri
    grado: int | None = Field(None, ge=1, le=100)  # efficacia al posto di quella in scheda
    bonus_danni: float = Field(0, ge=-100, le=1000, allow_inf_nan=False)  # % in più (come «Potenziato»)


def _side(db: Session, s: Side, cid: str, lato: str) -> dict:
    if s.tipo == "pg":
        ch = db.get(Character, s.id) if s.id is not None else None
        if ch is None:
            raise HTTPException(404, "Personaggio non trovato.")
        c = pg_combatant(ch)
        c["hp"] = c["hp_max"]  # simulazione a piena vita, risorse piene
        c["mp"], c["sp"] = c["mp_max"], c["sp_max"]
        if "ki" in c:
            c["ki"] = c["ki_max"]
    elif s.tipo == "creatura":
        c = creature_combatants([{"name": s.nome or "Creatura", "count": 1, "level": s.level, "rarity": s.rarity,
                                  "size": s.size}])[0]
    else:
        c = E.combatant(cid, s.nome.strip() or "Bersaglio", lato, s.hp,
                        stat_vals={"evasione": s.evasione, "difesa": s.difesa, "difesaMag": 0},
                        resistenze={k: s.resistenza for k in DAMAGE_TYPES} if s.resistenza else None)
    c.update({"id": cid, "lato": lato, "vivo": True, "status": [], "cooldown": {}, "ricarica_reale": {}})
    return c


def _cost(m: dict) -> tuple[str, float]:
    parts, tot = [], 0.0
    for k in m.get("costi") or []:
        if k.get("per", "lancio") != "lancio":
            continue
        v = rules.num(k.get("valore"))
        tot += v
        parts.append(f"{rules.fmt_n(v)} {k.get('status') if k.get('risorsa') == 'stack' else k.get('risorsa')}")
    return " + ".join(parts), tot


@router.get("/opzioni")
def options(db: Session = Depends(get_db)):
    """PG per i menu e i valori ammessi."""
    from sqlalchemy import select
    chars = db.scalars(select(Character).order_by(Character.id))
    return {"pg": [{"id": c.id, "nome": c.name, "level": c.level, "classe": c.classe} for c in chars],
            "rarita": list(rules.RARITIES), "taglie": [s["v"] for s in rules.SIZES]}


@router.post("")
def simulate(data: SimIn, db: Session = Depends(get_db)):
    att = _side(db, data.attaccante, A, "alleati")
    ber = _side(db, data.bersaglio, B, "nemici")
    if data.bonus_danni:
        att["status"].append({"nome": "Potenziato", "polarita": "buono", "stack": 1, "turni": 0, "valore": data.bonus_danni,
                              "stat": "", "fonte": A, "mod": {"danno_bonus": True}, "dispellabile": True, "negativo": False})
    if data.grado:
        for ab in att["abilita"]:
            ab["grado"] = ab["efficacia"] = data.grado
    wanted = {x.strip().lower() for x in data.abilita if x.strip()}
    out = []
    for ab in att["abilita"]:
        m = ab["mech"]
        if m.get("tipo") == "passiva" or (wanted and ab["nome"].lower() not in wanted):
            continue
        cost_txt, cost = _cost(m)
        row = {"abilita": ab["nome"], "tipo": "attacco" if ab.get("base") else m.get("tipo"), "testo": bool(ab.get("testo")),
               "costo": cost_txt, "costo_valore": rules.clean(cost)}
        if ab.get("testo"):
            out.append({**row, "nota": "Solo testo: nessun numero da calcolare."})
            continue
        side = (m.get("effetti") or [{}])[0].get("bersaglio", {}).get("lato", "nemico")
        target = A if side in ("se", "alleato") else B
        me = dict(att, abilita=list(att["abilita"]))
        if target == A:
            me["hp"] = 1  # cure e scudi su di sé: si parte quasi a zero, così si vede la cura intera
        st = E.new_state([me, dict(ber)])
        st["ordine"] = [A, B]
        try:
            p = E.preview(st, {"attore": A, "abilita": ab["nome"], "bersagli": [target], "forza": True})
        except E.EngineError as ex:
            out.append({**row, "nota": str(ex)})
            continue
        s = p["stima"].get(target) or {}
        kind = "danno" if "danno" in s else "cura" if "cura" in s else "scudo" if "scudo" in s else None
        if kind is None:
            out.append({**row, "nota": "Nessun numero: effetto di status o di controllo."})
            continue
        lo, hi = s[kind]
        hit = next((r["soglia"] for r in p["richieste"] if r["key"].startswith("colpo:")), None)
        crit = next((r["soglia"] for r in p["richieste"] if r["key"].startswith("crit:")), None)
        hitp = (hit if hit is not None else 100) / 100
        critp = (crit or 0) / 100 if kind == "danno" else 0
        avg = (lo + hi) / 2 * (1 + critp) * (hitp if kind == "danno" else 1)
        hp = rules.num(ber["hp_max"])
        row.update({"tipo_valore": kind, "min": lo, "max": hi, "medio": round(avg), "colpire": hit, "critico": crit,
                    "lanci": math.ceil(hp / avg) if kind == "danno" and avg > 0 else None,
                    "per_costo": round(avg / cost, 2) if cost else None, "passi": p["passi"][:20]})
        out.append(row)
    out.sort(key=lambda r: (r.get("medio") is None, -(r.get("medio") or 0)))
    return {"attaccante": {"nome": att["nome"], "stat": {k: att["stat"].get(k) for k in ("precisione", "critico", "moltFis", "moltMag")}},
            "bersaglio": {"nome": ber["nome"], "hp": ber["hp_max"],
                          "stat": {k: ber["stat"].get(k) for k in ("evasione", "difesa", "blocco")}},
            "risultati": out}
