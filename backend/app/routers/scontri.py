"""Scontri sulla plancia: avvio dall'incontro della Forgia, azioni con anteprima, reazioni, turni, annulla.

Lo stato vive nella tabella `scontri` (motore: `engine.py`); le risorse dei PG sono sincronizzate con
`Character.resources` in entrambe le direzioni: prima di ogni azione si leggono (il giocatore può averle cambiate
dalla sua plancia), dopo si scrivono.
"""
from __future__ import annotations

import copy
import random
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import engine as E
from .. import mech as MECH
from .. import rules
from ..auth import current_user, require_master
from ..db import get_db
from ..models import Character, ForgeEntry, Scontro, User
from ..mech_templates import CLASS_MECH
from ..serialize import maxes_of, rules_input
from .characters import tidy

router = APIRouter(prefix="/api/scontri", tags=["scontri"])

HISTORY_MAX = 10
ABILITY_SOURCES = ("active_skills", "skills", "talents", "titles")
Id = Field(min_length=1, max_length=40)


class CreatureIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=60)
    count: int = Field(1, ge=1, le=20)
    level: int = Field(1, ge=0, le=9999)
    rarity: str = Field("Comune", max_length=20)
    size: str = Field("Normale", max_length=20)


class StartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field("", max_length=120)
    encounter_id: int | None = None
    pg_ids: list[int] = Field(default_factory=list, max_length=20)
    creature: list[CreatureIn] = Field(default_factory=list, max_length=12)
    tutti: bool = False  # tutto il gruppo (ogni PG della campagna)
    tiri: dict[str, float] = Field(default_factory=dict, max_length=60)


class ActionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    attore: str = Id
    abilita: str = Field(min_length=1, max_length=120)
    bersagli: list[str] = Field(default_factory=list, max_length=20)
    tiri: dict[str, float] = Field(default_factory=dict, max_length=200)
    forza: bool = False


class PreviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    attore: str = Id
    abilita: str = Field(min_length=1, max_length=120)
    bersagli: list[str] = Field(default_factory=list, max_length=20)


class ReactIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int
    finestra: str = Id
    attore: str | None = Field(None, max_length=40)
    abilita: str | None = Field(None, max_length=120)
    bersagli: list[str] = Field(default_factory=list, max_length=20)
    tiri: dict[str, float] = Field(default_factory=dict, max_length=200)


class VersionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int


class StopIn(VersionIn):
    attore: str = Id
    abilita: str = Field(min_length=1, max_length=120)


class AdjustIn(VersionIn):
    """Correzione del Master su un combattente (vita, risorse, status rimossi, a terra/in piedi)."""
    hp: float | None = Field(None, ge=0, le=1e9, allow_inf_nan=False)
    mp: float | None = Field(None, ge=0, le=1e9, allow_inf_nan=False)
    sp: float | None = Field(None, ge=0, le=1e9, allow_inf_nan=False)
    remove_status: str | None = Field(None, max_length=80)
    vivo: bool | None = None


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------- Costruzione dei combattenti ----------

COST_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(MP|SP|KI|HP|PM|PS)\b", re.I)
KIND_OF = {"Incantesimo": "incantesimo", "Miracolo": "miracolo"}


def text_mech(x: dict) -> dict:
    """Abilità attiva senza meccanica: si usa lo stesso (costo e ricarica dalla scheda), l'effetto è il testo
    e lo applica il Master a mano."""
    costi = []
    for v, k in COST_RE.findall(str(x.get("cost") or "")):
        k = {"PM": "MP", "PS": "SP"}.get(k.upper(), k.upper())
        costi.append({"risorsa": k, "valore": float(v.replace(",", ".")), "per": "lancio"})
    cd = int(rules.num(x.get("cd")) or 0)
    text = str(x.get("effect") or "").strip() or "Effetto descritto nella scheda."
    return {"v": 1, "tipo": KIND_OF.get(str(x.get("kind") or ""), "skill"), "costi": costi[:4],
            "cooldown": {"valore": min(999, max(0, cd)), "unita": "turni"}, "tiro_colpire": False,
            "etichette": [str(s) for s in x.get("spheres") or []][:12],
            "effetti": [{"bersaglio": {"lato": "se"}, "azione": {"op": "narrativo", "testo": text[:600]}}]}


def divine_power(c: Character, x: dict, level: int) -> dict | None:
    """Miracolo (decisione 19 di docs/PROPOSTE.md): potenza × (1 + Fede/100) × molt. favore del dio.
    Il favore richiesto è quello del wizard (`favor`), altrimenti quello del livello; se il PG non ha il favore
    registrato nella reputazione cosmica il moltiplicatore del favore non si applica (×1): lo decide il Master."""
    if str(x.get("kind") or "") != "Miracolo":
        return None
    god = str(x.get("god") or "").strip()
    fede = rules.char_fede(c.stats or [])
    need = x.get("favor")
    need = int(rules.num(need)) if need is not None else rules.favor_required(level, True)
    fav = rules.char_favor(c.reputation or [], god) if god else {"v": 0, "recorded": False}
    fm = rules.favor_mult(fav["v"], need) if fav["recorded"] else {"mult": 1.0, "state": "non registrato"}
    return {"mult": round((1 + fede / 100) * fm["mult"], 4), "fede": fede, "favore": fm["mult"], "stato": fm["state"],
            "dio": god}


def abilities_of(c: Character) -> list[dict]:
    """Abilità di un PG per lo scontro. Con meccanica: skill attive, incantesimi, miracoli, skill passive, talenti,
    titoli. Senza meccanica: le skill di classe hanno quella di default (es. Dardo Magico), le altre abilità attive
    si usano come «solo testo» (costo e ricarica dalla scheda, effetto applicato dal Master)."""
    out, seen = [], set()
    for field in ABILITY_SOURCES:
        for x in getattr(c, field) or []:
            if not isinstance(x, dict):
                continue
            raw = x.get("mech")
            name = str(x.get("name") or "").strip()
            if not name or name.lower() in seen:
                continue
            testo = False
            if not raw and field == "active_skills":
                raw = CLASS_MECH.get(name.lower())
                if raw is None:
                    raw, testo = text_mech(x), True
            if not raw:
                continue
            m, errs = MECH.parse(raw)
            if errs:
                continue
            seen.add(name.lower())
            lvl = int(rules.num(x.get("lvl")) or 1)
            eff = int(rules.num(x.get("efficacia")) or lvl)
            div = divine_power(c, x, eff) if field == "active_skills" else None
            out.append({"nome": name, "grado": lvl, "efficacia": eff,
                        "mech": MECH.dump(m), "descrizione": str(x.get("effect") or "")[:300], "fonte": field,
                        **({"testo": True} if testo else {}), **({"divino": div} if div else {})})
    return out


def pg_combatant(c: Character) -> dict:
    ri = rules_input(c)
    d = {x["key"]: x["value"] for x in rules.derived(ri)}
    mx = maxes_of(ri)
    res = rules.clamp_resources(c.resources, mx)
    weapon = next((it for it in rules.equipped_items(ri.get("inventory") or []) if rules.num(it.get("weapon_base")) > 0),
                  None)
    base = rules.num(weapon["weapon_base"]) if weapon else rules.weapon_base_mid(rules.rarity_for_level(c.level))
    stat_vals = {k: rules.num(d.get(k)) for k in ("precisione", "evasione", "critico", "blocco", "difesa", "difesaMag",
                                                  "moltFis", "moltMag", "iniziativa")}
    stat_vals["moltFis"] = stat_vals["moltFis"] or 1
    stat_vals["moltMag"] = stat_vals["moltMag"] or 1
    combat = c.combat or {}
    cb = E.combatant(f"p{c.id}", c.name, "alleati", mx["hp"], mp=mx["mp"], sp=mx["sp"],
                     ki=mx.get("ki"), ki_regen=rules.num(d.get("kiCombat")), stat_vals=stat_vals, arma=[base, base],
                     abilita=abilities_of(c), rif=f"pg:{c.id}", tipo="pg",
                     posizione=combat.get("position") or "Mischia",
                     hp_cur=res.get("hp"), mp_cur=res.get("mp"), sp_cur=res.get("sp"), ki_cur=res.get("ki"))
    cb["ricarica_reale"] = active_recharges(c)
    return cb


def active_recharges(c: Character) -> dict:
    out = {}
    t = now()
    for name, until in ((c.combat or {}).get("ricariche") or {}).items():
        if str(until) > t:
            out[name] = str(until)[:16].replace("T", " ")
    return out


def creature_combatants(rows: list[dict], ref: Any = "x", k: int = 0, taken: set | None = None) -> list[dict]:
    """Combattenti dalle righe di creature. `taken` = id già usati (scontro in corso): si salta oltre."""
    out = []
    taken = set(taken or ())
    for row in rows:
        n = max(0, int(rules.num(row.get("count")) or 1))
        hp = rules.num(row.get("hp")) or rules.creature(row.get("level"), row.get("rarity"), row.get("size"))["hp"]
        dmg = rules.num(row.get("dmg")) or rules.creature(row.get("level"), row.get("rarity"), row.get("size"))["dmg"]
        lv = rules.num(row.get("level"))
        for i in range(n):
            k += 1
            while f"n{k}" in taken:
                k += 1
            name = str(row.get("name") or "Creatura").strip()[:60]
            if n > 1:
                name += f" {chr(65 + i) if i < 26 else i + 1}"
            out.append(E.combatant(f"n{k}", name, "nemici", hp, arma=[rules.js_round(dmg * 0.8), rules.js_round(dmg * 1.2)],
                                   stat_vals={"precisione": 75, "evasione": min(40, 5 + lv / 10), "critico": 5,
                                              "iniziativa": 10 + lv / 10},
                                   rif=f"creatura:{ref}:{k}", tipo=str(row.get("type") or "creatura"),
                                   taglia=str(row.get("size") or "Normale")))
    return out


# ---------- Accesso ----------

def _get(db: Session, sid: int) -> Scontro:
    s = db.get(Scontro, sid)
    if s is None:
        raise HTTPException(404, "Scontro non trovato.")
    return s


def _active(db: Session) -> Scontro | None:
    return db.scalar(select(Scontro).where(Scontro.active.is_(True)).order_by(Scontro.id.desc()))


def _mine(state: dict, user: User, db: Session) -> list[str]:
    """Combattenti che l'utente controlla: il Master tutti, il giocatore i propri PG e le loro evocazioni."""
    cs = state.get("combattenti") or {}
    if user.role == "master":
        return list(cs)
    own = {f"pg:{cid}" for cid in db.scalars(select(Character.id).where(Character.owner_id == user.id))}
    mine = [k for k, c in cs.items() if c.get("rif") in own]
    mine += [k for k, c in cs.items() if (c.get("evocazione") or {}).get("fonte") in mine]
    return mine


def _check_version(s: Scontro, v: int):
    if s.version != v:
        raise HTTPException(409, "Lo scontro è cambiato nel frattempo: ricarica e riprova.")


def _pcs(db: Session, state: dict) -> dict[int, Character]:
    ids = [int(c["rif"].split(":")[1]) for c in state["combattenti"].values() if str(c.get("rif", "")).startswith("pg:")]
    return {c.id: c for c in db.scalars(select(Character).where(Character.id.in_(ids)))} if ids else {}


def pull(db: Session, state: dict):
    """Risorse attuali dei PG nello stato (il giocatore può averle cambiate dalla sua plancia)."""
    for cid, ch in _pcs(db, state).items():
        cb = state["combattenti"].get(f"p{cid}")
        if not cb:
            continue
        r = ch.resources or {}
        for k in ("hp", "mp", "sp", "ki"):
            if k in r and f"{k}_max" in cb:
                cb[k] = min(rules.num(cb[f"{k}_max"]), rules.num(r[k]))
        if cb["hp"] > 0 and not cb.get("vivo", True) and not ch.death:
            cb["vivo"] = True  # rialzato fuori dallo scontro (cura manuale)


def push(db: Session, state: dict):
    for cid, ch in _pcs(db, state).items():
        cb = state["combattenti"].get(f"p{cid}")
        if not cb:
            continue
        r = dict(ch.resources or {})
        for k in ("hp", "mp", "sp", "ki"):
            if k in cb:
                r[k] = rules.clean(round(rules.num(cb[k]), 2))
        ch.resources = tidy(r)
        flag_modified(ch, "resources")
        rr = cb.get("ricarica_reale") or {}
        if rr:
            combat = dict(ch.combat or {})
            ric = dict(combat.get("ricariche") or {})
            for name, txt in rr.items():
                if name in ric:
                    continue
                n, _, unit = str(txt).partition(" ")
                hours = {"ore": 1, "giorni": 24, "settimana": 24 * 7}.get(unit, 24) * max(1, int(rules.num(n) or 1))
                ric[name] = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat(timespec="seconds")
            combat["ricariche"] = ric
            ch.combat = combat
            flag_modified(ch, "combat")


def out(s: Scontro, user: User, db: Session, result: dict | None = None) -> dict:
    st = E.public(s.state or {})
    st.pop("seq", None)
    mine = _mine(s.state or {}, user, db)
    if user.role != "master":  # i giocatori non vedono i tiri e le abilità dei nemici
        for k, c in st["combattenti"].items():
            if k not in mine and c["lato"] != "alleati":
                c["abilita"] = []
    return {"id": s.id, "name": s.name, "version": s.version, "active": s.active, "encounter_id": s.encounter_id,
            "state": st, "mine": mine, "master": user.role == "master", "can_undo": bool(s.history),
            **({"result": result} if result is not None else {})}


def _commit(db: Session, s: Scontro, state: dict, before: dict | None):
    if before is not None:
        hist = list(s.history or [])
        hist.append(before)
        s.history = hist[-HISTORY_MAX:]
        flag_modified(s, "history")
    s.state = tidy(state)
    flag_modified(s, "state")
    push(db, state)
    db.commit()
    db.refresh(s)


def _rng() -> random.Random:
    return random.SystemRandom()


def _engine(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except E.EngineError as ex:
        raise HTTPException(422, str(ex)) from None


def _owns(state: dict, user: User, db: Session, cid: str):
    if cid not in _mine(state, user, db):
        raise HTTPException(403, "Puoi agire solo con i tuoi personaggi.")


# ---------- Endpoint ----------

@router.get("/attivo")
def active(user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _active(db)
    return {"scontro": out(s, user, db) if s else None}


@router.post("")
def start(data: StartIn, user: User = Depends(require_master), db: Session = Depends(get_db)):
    if _active(db):
        raise HTTPException(409, "C'è già uno scontro in corso: chiudilo prima di iniziarne un altro.")
    combattenti: list[dict] = []
    name = data.name.strip()
    pg_ids = list(dict.fromkeys(data.pg_ids))
    if data.tutti:
        pg_ids = list(db.scalars(select(Character.id).order_by(Character.id)))
    if data.encounter_id is not None:
        e = db.get(ForgeEntry, data.encounter_id)
        if e is None or e.kind != "encounters":
            raise HTTPException(404, "Incontro non trovato.")
        if e.closed:
            raise HTTPException(409, "Incontro già chiuso.")
        combattenti += creature_combatants((e.data or {}).get("creatures") or [], e.id)
        name = name or e.name
        if not pg_ids:
            pg_ids = [int(x) for x in (e.data or {}).get("party") or [] if str(x).isdigit()]
    if data.creature:
        combattenti += creature_combatants([c.model_dump() for c in data.creature], "manuale", len(combattenti))
    chars = list(db.scalars(select(Character).where(Character.id.in_(pg_ids)))) if pg_ids else []
    if len(chars) != len(pg_ids):
        raise HTTPException(404, "Personaggio non trovato.")
    combattenti = [pg_combatant(c) for c in chars] + combattenti
    if not any(c["lato"] == "alleati" for c in combattenti):
        raise HTTPException(422, "Serve almeno un personaggio: i nemici si possono aggiungere dopo.")
    state = E.new_state(combattenti)
    _engine(E.start, state, _rng(), data.tiri)
    s = Scontro(name=name or "Scontro", encounter_id=data.encounter_id, state=tidy(state), history=[], active=True,
                created_at=now())
    db.add(s)
    push(db, state)
    db.commit()
    db.refresh(s)
    return out(s, user, db)


@router.post("/{sid}/anteprima")
def preview(sid: int, data: PreviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _get(db, sid)
    state = copy.deepcopy(s.state)
    _owns(state, user, db, data.attore)
    pull(db, state)
    p = _engine(E.preview, state, {"attore": data.attore, "abilita": data.abilita, "bersagli": data.bersagli,
                                   "forza": user.role == "master"})
    return p


@router.post("/{sid}/azione")
def action(sid: int, data: ActionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _get(db, sid)
    if not s.active:
        raise HTTPException(409, "Lo scontro è chiuso.")
    _check_version(s, data.version)
    state = copy.deepcopy(s.state)
    _owns(state, user, db, data.attore)
    if data.forza and user.role != "master":
        raise HTTPException(403, "Solo il Master può forzare un'azione.")
    before = copy.deepcopy(s.state)
    pull(db, state)
    res = _engine(E.act, state, {"attore": data.attore, "abilita": data.abilita, "bersagli": data.bersagli,
                                 "forza": data.forza}, _rng(), data.tiri)
    _commit(db, s, state, before)
    return out(s, user, db, _result(res))


def _result(res: dict) -> dict:
    return {"esito": res.get("esito"), "eventi": res.get("eventi") or [], "passi": res.get("passi") or [],
            "tiri": res.get("tiri_usati") or {}, "finestra": res.get("finestra")}


@router.post("/{sid}/reazione")
def reaction(sid: int, data: ReactIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _get(db, sid)
    _check_version(s, data.version)
    state = copy.deepcopy(s.state)
    w = next((x for x in state.get("in_attesa") or [] if x.get("id") == data.finestra), None)
    if w is None:
        raise HTTPException(409, "La finestra di reazione è già chiusa.")
    mine = _mine(state, user, db)
    if data.attore:
        _owns(state, user, db, data.attore)
    elif user.role != "master" and w["attore"] not in mine and not any(c["id"] in mine for c in w["candidati"]):
        raise HTTPException(403, "Non puoi chiudere questa finestra.")
    before = copy.deepcopy(s.state)
    pull(db, state)
    react = {"attore": data.attore, "abilita": data.abilita, "bersagli": data.bersagli} if data.attore else None
    res = _engine(E.react, state, data.finestra, react, _rng(), data.tiri)
    _commit(db, s, state, before)
    return out(s, user, db, _result(res))


@router.post("/{sid}/mantenuto/stop")
def stop_maintained(sid: int, data: StopIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _get(db, sid)
    _check_version(s, data.version)
    state = copy.deepcopy(s.state)
    _owns(state, user, db, data.attore)
    before = copy.deepcopy(s.state)
    _engine(E.toggle_off, state, data.attore, data.abilita)
    _commit(db, s, state, before)
    return out(s, user, db)


@router.post("/{sid}/fine-turno")
def end_turn(sid: int, data: VersionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _get(db, sid)
    if not s.active:
        raise HTTPException(409, "Lo scontro è chiuso.")
    _check_version(s, data.version)
    state = copy.deepcopy(s.state)
    cur = E.current(state)
    if user.role != "master" and (cur is None or cur["id"] not in _mine(state, user, db)):
        raise HTTPException(403, "Solo chi ha il turno (o il Master) può chiuderlo.")
    if any(w.get("tipo") == "reazione" for w in state.get("in_attesa") or []):
        raise HTTPException(409, "C'è una reazione in sospeso: risolvila prima.")
    before = copy.deepcopy(s.state)
    pull(db, state)
    res = _engine(E.next_turn, state, _rng())
    _commit(db, s, state, before)
    return out(s, user, db, _result(res))


@router.post("/{sid}/combattenti/{cid}")
def adjust(sid: int, cid: str, data: AdjustIn, user: User = Depends(require_master), db: Session = Depends(get_db)):
    s = _get(db, sid)
    _check_version(s, data.version)
    state = copy.deepcopy(s.state)
    c = state["combattenti"].get(cid)
    if c is None:
        raise HTTPException(404, "Combattente non trovato.")
    before = copy.deepcopy(s.state)
    pull(db, state)
    parts = []
    for k in ("hp", "mp", "sp"):
        v = getattr(data, k)
        if v is not None:
            c[k] = min(rules.num(c.get(f"{k}_max")), v)
            parts.append(f"{k.upper()} {rules.fmt_n(c[k])}")
    if data.remove_status:
        before_n = len(c.get("status") or [])
        c["status"] = [x for x in c.get("status") or [] if x.get("nome") != data.remove_status]
        if len(c["status"]) < before_n:
            parts.append(f"rimosso {data.remove_status}")
    if data.vivo is not None:
        c["vivo"] = data.vivo
        if data.vivo and rules.num(c.get("hp")) <= 0:
            c["hp"] = 1
        parts.append("in piedi" if data.vivo else "a terra")
    if parts:
        state.setdefault("registro", []).append({"r": state.get("round", 1), "k": "master",
                                                 "t": f"Master: {c['nome']} — {', '.join(parts)}."})
    _commit(db, s, state, before)
    return out(s, user, db)


class AddIn(VersionIn):
    creature: list[CreatureIn] = Field(default_factory=list, max_length=12)
    encounter_id: int | None = None
    pg_ids: list[int] = Field(default_factory=list, max_length=20)


@router.post("/{sid}/aggiungi")
def add(sid: int, data: AddIn, user: User = Depends(require_master), db: Session = Depends(get_db)):
    """Il Master aggiunge creature (a mano o da un incontro della Forgia) o PG a uno scontro in corso."""
    s = _get(db, sid)
    if not s.active:
        raise HTTPException(409, "Lo scontro è chiuso.")
    _check_version(s, data.version)
    state = copy.deepcopy(s.state)
    taken = set(state["combattenti"])
    new: list[dict] = []
    rows = [c.model_dump() for c in data.creature]
    if data.encounter_id is not None:
        e = db.get(ForgeEntry, data.encounter_id)
        if e is None or e.kind != "encounters":
            raise HTTPException(404, "Incontro non trovato.")
        rows += (e.data or {}).get("creatures") or []
    if rows:
        new += creature_combatants(rows, data.encounter_id or "manuale", 0, taken)
    for cid in dict.fromkeys(data.pg_ids):
        if f"p{cid}" in taken:
            continue
        ch = db.get(Character, cid)
        if ch is None:
            raise HTTPException(404, "Personaggio non trovato.")
        new.append(pg_combatant(ch))
    if not new:
        raise HTTPException(422, "Niente da aggiungere.")
    before = copy.deepcopy(s.state)
    pull(db, state)
    _engine(E.add_combatants, state, new, _rng())
    _commit(db, s, state, before)
    return out(s, user, db)


@router.post("/{sid}/annulla")
def undo(sid: int, data: VersionIn, user: User = Depends(require_master), db: Session = Depends(get_db)):
    s = _get(db, sid)
    _check_version(s, data.version)
    hist = list(s.history or [])
    if not hist:
        raise HTTPException(409, "Niente da annullare.")
    state = hist.pop()
    s.history = hist
    flag_modified(s, "history")
    state.setdefault("registro", []).append({"r": state.get("round", 1), "k": "master", "t": "Master: ultima azione annullata."})
    s.state = state
    flag_modified(s, "state")
    push(db, state)
    db.commit()
    db.refresh(s)
    return out(s, user, db)


@router.post("/{sid}/chiudi")
def close(sid: int, data: VersionIn, user: User = Depends(require_master), db: Session = Depends(get_db)):
    s = _get(db, sid)
    _check_version(s, data.version)
    if not s.active:
        raise HTTPException(409, "Lo scontro è già chiuso.")
    state = copy.deepcopy(s.state)
    pull(db, state)
    state.setdefault("registro", []).append({"r": state.get("round", 1), "k": "round", "t": "Scontro chiuso."})
    s.active = False
    s.closed_at = now()
    s.history = []
    flag_modified(s, "history")
    _commit(db, s, state, None)
    return out(s, user, db)


@router.get("/candidati")
def candidates(user: User = Depends(require_master), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Per avviare uno scontro: incontri aperti della Forgia e PG (con quante abilità meccaniche hanno)."""
    encs = db.scalars(select(ForgeEntry).where(ForgeEntry.kind == "encounters").order_by(ForgeEntry.id.desc()))
    chars = db.scalars(select(Character).order_by(Character.id))
    return {
        "encounters": [{"id": e.id, "name": e.name, "summary": e.summary, "party": (e.data or {}).get("party") or [],
                        "creatures": sum(int(rules.num(c.get("count")) or 1) for c in (e.data or {}).get("creatures") or [])}
                       for e in encs if not e.closed],
        "characters": [{"id": c.id, "name": c.name, "level": c.level, "classe": c.classe,
                        "abilities": len([a for a in abilities_of(c) if not a.get("testo")])} for c in chars],
    }

