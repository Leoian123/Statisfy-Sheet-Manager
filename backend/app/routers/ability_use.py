"""«Usa abilità» dalla plancia di combattimento, senza aprire uno scontro.

Il motore (`engine.py`) calcola su uno stato temporaneo con due combattenti (chi usa l'abilità e il bersaglio);
poi il risultato si applica alle schede:
  - chi usa: risorse spese, ricarica nella lista `combat.cooldowns` (quella del pannello), effetti su di sé;
  - bersaglio PG: vita e effetti (scudo → assorbimento, danno o cura nel tempo → HP a turno);
  - bersaglio creatura dell'incontro in corso (Forgia): vita della riga dell'incontro;
  - bersaglio «a voce»: niente da applicare, il risultato va nel registro.
Un giocatore usa solo le abilità dei suoi PG e non può danneggiare un altro PG.
"""
from __future__ import annotations

import copy
import random
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import engine as E
from .. import rules
from ..auth import current_user
from ..db import get_db
from ..models import Character, ForgeEntry, User
from .characters import get_char, save, set_json, tidy
from .scontri import creature_combatants, pg_combatant

router = APIRouter(prefix="/api/characters/{char_id}/abilita", tags=["abilita"])

SELF = "io"
TARGET = "bersaglio"


class TargetIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: Literal["nessuno", "pg", "creatura", "voce"] = "nessuno"
    id: int | None = None  # pg: id del PG; creatura: id dell'incontro della Forgia
    index: int | None = Field(None, ge=0, le=200)  # creatura: riga dell'incontro
    nome: str = Field("Bersaglio", max_length=60)  # voce
    difesa: float = Field(0, ge=0, le=1e9, allow_inf_nan=False)
    resistenza: float = Field(0, ge=0, le=100, allow_inf_nan=False)  # % a tutti i danni non puri


class UseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    abilita: str = Field(min_length=1, max_length=120)
    bersaglio: TargetIn = Field(default_factory=TargetIn)
    tiri: dict[str, float] = Field(default_factory=dict, max_length=200)


def _target(db: Session, user: User, c: Character, t: TargetIn) -> tuple[dict | None, object]:
    """Combattente bersaglio (id TARGET) e la cosa a cui riapplicare il risultato."""
    if t.tipo == "nessuno":
        return None, None
    if t.tipo == "pg":
        if t.id is None:
            raise HTTPException(422, "Scegli il personaggio.")
        if t.id == c.id:
            return None, None  # su di sé: il motore usa chi lancia
        other = db.get(Character, t.id)
        if other is None:
            raise HTTPException(404, "Personaggio non trovato.")
        cb = pg_combatant(other)
        cb.update({"id": TARGET})
        return cb, other
    if t.tipo == "creatura":
        e = db.get(ForgeEntry, t.id) if t.id is not None else None
        if e is None or e.kind != "encounters":
            raise HTTPException(404, "Incontro non trovato.")
        rows = (e.data or {}).get("creatures") or []
        if t.index is None or not 0 <= t.index < len(rows):
            raise HTTPException(422, "Creatura non valida.")
        row = dict(rows[t.index], count=1)
        cb = creature_combatants([row], e.id)[0]
        count = int(rules.num(rows[t.index].get("count")) or 1)
        live = dict((e.data or {}).get("live") or {})
        hp_all = list(live.get("hp") or [])
        mx = rules.num(cb["hp_max"]) * count
        cur = rules.num(hp_all[t.index]) if t.index < len(hp_all) else mx
        cb.update({"id": TARGET, "nome": str(rows[t.index].get("name") or "Creatura"), "hp": cur, "hp_max": mx,
                   "vivo": cur > 0})
        return cb, (e, t.index)
    # a voce: bersaglio immaginario con vita alta (non muore), difesa e resistenza indicate
    cb = E.combatant(TARGET, t.nome.strip() or "Bersaglio", "nemici", 1e9,
                     stat_vals={"evasione": 0, "difesa": t.difesa, "difesaMag": 0},
                     resistenze={k: t.resistenza for k in ("fisico", "magico", *E_TYPES)} if t.resistenza else None)
    return cb, None


E_TYPES = ["Ignis", "Aqua", "Terra", "Ventus", "Mens", "Anima", "Vis", "Vita", "Spatium", "Tempus", "Luce", "Ombra", "Veleno"]


def _state(db: Session, user: User, c: Character, data: UseIn) -> tuple[dict, dict, object, dict | None]:
    me = pg_combatant(c)
    me["id"] = SELF
    me["cooldown"] = {str(x.get("name")): int(rules.num(x.get("turns"))) for x in (c.combat or {}).get("cooldowns") or []
                      if rules.num(x.get("turns")) > 0}
    tgt, ref = _target(db, user, c, data.bersaglio)
    if tgt is not None:
        hostile_side = data.bersaglio.tipo != "pg"
        tgt["lato"] = "nemici" if hostile_side else "alleati"
    st = E.new_state([me] + ([tgt] if tgt else []))
    st["ordine"] = [SELF] + ([TARGET] if tgt else [])
    ab = next((a for a in me["abilita"] if a["nome"].lower() == data.abilita.strip().lower()), None)
    if ab is None:
        raise HTTPException(404, f"{c.name} non ha «{data.abilita}».")
    return st, me, ref, tgt


def _chosen(st: dict) -> list[str]:
    return [TARGET] if TARGET in st["combattenti"] else [SELF]


def _status_effects(sts: list[dict]) -> list[dict]:
    """Status del motore → effetti del pannello combattimento (nome, tipo, testo, turni, HP a turno, assorbimento)."""
    out = []
    for s in sts:
        mod = s.get("mod") or {}
        v = rules.num(s.get("valore")) * max(1, int(s.get("stack") or 1))
        eff = {"name": s["nome"][:60], "kind": "good" if s.get("polarita") == "buono" else "bad",
               "turns": max(1, int(s.get("turni") or 0) or 99)}
        if mod.get("scudo"):
            eff.update(absorb=rules.clean(round(rules.num(s.get("valore")))), text=f"Assorbe {rules.fmt_n(s.get('valore'))} danni")
        elif mod.get("tick_danno"):
            eff.update(hpPerTurn=-rules.clean(round(v)), text=f"{rules.fmt_n(v)} danni a turno")
        elif mod.get("tick_cura"):
            eff.update(hpPerTurn=rules.clean(round(v)), text=f"+{rules.fmt_n(v)} HP a turno")
        else:
            extra = f" {rules.fmt_n(s.get('valore'))}%" if s.get("valore") else ""
            eff["text"] = (s["nome"] + extra + (f" ({s['stat']})" if s.get("stat") else ""))[:300]
        out.append(eff)
    return out


@router.get("")
def list_abilities(char_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Abilità usabili dal pannello: nome, tipo, costi, ricarica, bersaglio tipico, se sono solo testo."""
    c = get_char(char_id, user, db)
    me = pg_combatant(c)
    pub = E.public(E.new_state([me]))["combattenti"][me["id"]]["abilita"]
    cds = {str(x.get("name")): int(rules.num(x.get("turns"))) for x in (c.combat or {}).get("cooldowns") or []}
    # Bersagli possibili: i PG del gruppo e le creature dell'incontro in corso (Forgia, «Avvia»)
    pcs = [{"id": x.id, "nome": x.name} for x in db.scalars(select(Character).order_by(Character.id))]
    creature = []
    for e in db.scalars(select(ForgeEntry).where(ForgeEntry.kind == "encounters")):
        live = (e.data or {}).get("live") or {}
        if not live.get("active") or e.closed:
            continue
        rows = (e.data or {}).get("creatures") or []
        hp = list(live.get("hp") or [])
        for i, row in enumerate(rows):
            mx = rules.num(row.get("hp")) * (int(rules.num(row.get("count"))) or 1)
            cur = rules.num(hp[i]) if i < len(hp) else mx
            creature.append({"encounter_id": e.id, "index": i, "nome": str(row.get("name") or "Creatura"),
                             "count": int(rules.num(row.get("count")) or 1), "hp": rules.clean(cur), "max": rules.clean(mx)})
    return {"abilita": [{**a, "ricarica": cds.get(a["nome"], 0)} for a in pub if a["tipo"] != "passiva"],
            "bersagli": {"pg": pcs, "creature": creature}}


@router.post("/anteprima")
def preview(char_id: int, data: UseIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    st, _, _, _ = _state(db, user, c, data)
    try:
        p = E.preview(st, {"attore": SELF, "abilita": data.abilita, "bersagli": _chosen(st), "forza": True})
    except E.EngineError as ex:
        raise HTTPException(422, str(ex)) from None
    hit = next((r["soglia"] for r in p["richieste"] if r["key"].startswith("colpo:")), None)
    names = {SELF: c.name, TARGET: st["combattenti"].get(TARGET, {}).get("nome", "")}
    return {"stima": {names.get(k, k): v for k, v in p["stima"].items()}, "passi": p["passi"],
            "richieste": [r for r in p["richieste"] if not r["key"].startswith("ini:")], "colpire": hit}


@router.post("")
def use(char_id: int, data: UseIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    st, me, ref, tgt = _state(db, user, c, data)
    try:
        res = E.act(st, {"attore": SELF, "abilita": data.abilita, "bersagli": _chosen(st), "forza": True},
                    random.SystemRandom(), data.tiri, reactions=False)
    except E.EngineError as ex:
        raise HTTPException(422, str(ex)) from None
    after_me = st["combattenti"][SELF]
    after_t = st["combattenti"].get(TARGET)
    if isinstance(ref, Character) and user.role != "master" and ref.owner_id != user.id \
            and rules.num(after_t["hp"]) < rules.num(tgt["hp"]):
        raise HTTPException(403, "Non puoi ferire il personaggio di un altro giocatore.")

    # Chi usa: risorse, ricarica (lista del pannello), effetti su di sé, registro
    combat = {"position": "Mischia", "turn": 1, "effects": [], "cooldowns": [], "log": [], **copy.deepcopy(c.combat or {})}
    r = dict(c.resources or {})
    for k in ("hp", "mp", "sp", "ki"):
        if k in after_me:
            r[k] = rules.clean(round(rules.num(after_me[k]), 2))
    m = next(a for a in me["abilita"] if a["nome"].lower() == data.abilita.strip().lower())
    cd = int(rules.num((m["mech"].get("cooldown") or {}).get("valore")))
    if cd and (m["mech"].get("cooldown") or {}).get("unita", "turni") == "turni":
        combat["cooldowns"] = [x for x in combat["cooldowns"] if x.get("name") != m["nome"]] + [{"name": m["nome"], "turns": cd}]
    combat["effects"] = list(combat.get("effects") or []) + _status_effects(after_me.get("status") or [])
    lines = [str(ev.get("t")) for ev in res.get("eventi") or []]
    if data.bersaglio.tipo == "voce":  # la vita del bersaglio a voce è fittizia: non va nel registro
        lines = [re.sub(r"\. HP [\d.]+\.$", ".", x) for x in lines]
    for line in lines:
        rules.add_log(combat, line[:200])
    set_json(c, "combat", tidy(combat))
    set_json(c, "resources", tidy(r))
    c.death = None

    # Bersaglio: PG (vita ed effetti) o creatura dell'incontro (vita della riga)
    if isinstance(ref, Character) and after_t is not None:
        oc = {"position": "Mischia", "turn": 1, "effects": [], "cooldowns": [], "log": [], **copy.deepcopy(ref.combat or {})}
        orr = dict(ref.resources or {})
        orr["hp"] = rules.clean(round(rules.num(after_t["hp"]), 2))
        oc["effects"] = list(oc.get("effects") or []) + _status_effects(after_t.get("status") or [])
        rules.add_log(oc, f"{c.name} usa {m['nome']} su {ref.name}.")
        set_json(ref, "combat", tidy(oc))
        set_json(ref, "resources", tidy(orr))
    elif isinstance(ref, tuple) and after_t is not None:
        e, i = ref
        data_ = dict(e.data or {})
        live = dict(data_.get("live") or {})
        rows = data_.get("creatures") or []
        hp = list(live.get("hp") or [rules.num(x.get("hp")) * (int(rules.num(x.get("count"))) or 1) for x in rows])
        while len(hp) < len(rows):
            hp.append(rules.num(rows[len(hp)].get("hp")) * (int(rules.num(rows[len(hp)].get("count"))) or 1))
        hp[i] = rules.clean(max(0, round(rules.num(after_t["hp"]))))
        live["hp"] = hp
        data_["live"] = live
        e.data = data_
        flag_modified(e, "data")
    out = save(db, c)
    return {"character": out, "eventi": lines, "passi": res.get("passi") or [],
            "tiri": res.get("tiri_usati") or {}}
