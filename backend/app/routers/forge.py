"""Forgia del Master: libreria della campagna, wizard (anteprima e salvataggio), profilo di drop, chiusura incontri.
Solo per il Master. Regole in rules.py, logica dei wizard in forge.py."""
import copy
import random
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import forge, rules
from ..auth import require_master
from ..db import get_db
from ..models import Campaign, Character, ForgeEntry, Npc
from ..serialize import rules_input

router = APIRouter(prefix="/api/forge", tags=["forge"], dependencies=[Depends(require_master)])

Kind = Literal["skills", "classes", "races", "titles", "npcs", "encounters", "spells", "miracles"]


class DraftIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Kind
    draft: dict[str, Any] = Field(default_factory=dict)


class DropProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    creatures: list[dict[str, Any]]
    kind: str | None = None
    seed: int | None = None


class DropRollIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile: dict[str, Any]
    seed: int | None = None


class CloseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["intera", "divisa"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _session(db: Session) -> int:
    c = db.scalar(select(Campaign).order_by(Campaign.id))
    return c.session if c else 1


def _chars(db: Session) -> list[Character]:
    return list(db.scalars(select(Character).order_by(Character.id)).unique())


def _char_ctx(c: Character) -> dict:
    ri = rules_input(c)
    return {"id": c.id, "name": c.name, "level": c.level, "classe": c.classe, "exp_pct": c.exp_pct,
            "stats": ri["stats"], "skills": c.skills or [], "active_skills": c.active_skills or [],
            "titles": c.titles or [], "reputation": c.reputation or [], "ri": ri,
            "derived": {d["key"]: d["value"] for d in rules.derived(ri)}}


def _entries(db: Session, kind: str | None = None) -> list[ForgeEntry]:
    q = select(ForgeEntry).order_by(ForgeEntry.id)
    if kind:
        q = q.where(ForgeEntry.kind == kind)
    return list(db.scalars(q))


def _ctx(db: Session) -> dict:
    lib: dict[str, list] = {k: [] for k in forge.KINDS}
    for e in _entries(db):
        lib.setdefault(e.kind, []).append(e.data or {})
    return {"chars": [_char_ctx(c) for c in _chars(db)], "library": lib}


def entry_out(e: ForgeEntry, names: dict[int, str] | None = None) -> dict:
    return {"id": e.id, "kind": e.kind, "name": e.name, "summary": e.summary, "data": e.data or {},
            "assigned_to": e.assigned_to, "assigned_name": (names or {}).get(e.assigned_to) if e.assigned_to else None,
            "npc_id": e.npc_id, "closed": e.closed, "session": e.session, "created_at": e.created_at}


def _names(db: Session) -> dict[int, str]:
    return {c.id: c.name for c in _chars(db)}


def _rng(seed: int | None) -> random.Random:
    return random.Random(seed) if seed is not None else random.SystemRandom()


def _set_json(obj: Any, field: str, value: Any) -> None:
    setattr(obj, field, value)
    flag_modified(obj, field)


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    """Opzioni dei wizard: costanti della Forgia, PG, contenuti già creati, regni e classi base."""
    chars = _chars(db)
    lib = _entries(db)
    ctx_like = {"chars": [{"titles": c.titles or []} for c in chars],
                "library": {"titles": [e.data for e in lib if e.kind == "titles"]}}
    codes = list(dict.fromkeys([*rules.FORGE_STATS, *(r.get("code") for c in chars for r in (c.stats or []) if r.get("code"))]))
    return {
        **rules.forge_config(),
        "kinds": [{"key": k, "label": v} for k, v in forge.KIND_LABEL.items()],
        "steps": {k: list(w["steps"]) for k, w in forge.WIZARDS.items()},
        "rarities": [{"name": r["name"], "key": rules.rarity_key(r["name"]), "grade": r["grade"],
                      "creature_mult": r["creature_mult"], "weapon_base": list(r["weapon_base"])} for r in rules.RARITY_SCALE],
        "roman": list(rules.ROMAN), "grades": list(rules.GRADES),
        "stat_codes": codes,
        "characters": [{"id": c.id, "name": c.name, "level": c.level, "classe": c.classe, "exp_pct": rules.clean(rules.num(c.exp_pct))}
                       for c in chars],
        "library_skills": [{"name": e.name, "type": e.data.get("type"), "mode": e.data.get("mode")} for e in lib if e.kind == "skills"],
        "known_titles": forge.known_titles(ctx_like),
        "classes": [c["name"] for c in rules.CLASSES] + [e.name for e in lib if e.kind == "classes"],
        "races": [e.name for e in lib if e.kind == "races"],
        "kingdoms": [k["name"] for k in rules.KINGDOMS],
        "session": _session(db),
    }


@router.get("/library")
def library(kind: Kind | None = None, db: Session = Depends(get_db)):
    names = _names(db)
    return [entry_out(e, names) for e in _entries(db, kind)]


@router.post("/preview")
def preview(data: DraftIn, db: Session = Depends(get_db)):
    """Validazione per passo e valori calcolati della bozza (non salva niente)."""
    return forge.preview(data.kind, data.draft, _ctx(db))


@router.post("/entries", status_code=201)
def create_entry(data: DraftIn, db: Session = Depends(get_db)):
    """Salva la bozza nella libreria; se il wizard assegna a un PG (skill, titolo, incantesimo, miracolo) lo modifica."""
    ctx = _ctx(db)
    entry, err = forge.build(data.kind, data.draft, ctx)
    if entry is None:
        raise HTTPException(422, err)
    session = _session(db)
    messages = [f"{forge.KIND_LABEL[data.kind]}: «{entry['name']}» aggiunto alla libreria."]
    e = ForgeEntry(kind=data.kind, name=entry["name"][:100], summary=entry.get("summary", ""), session=session, created_at=_now())
    apply = forge.apply_fn(data.kind)
    target = entry.get("assignedTo")
    if apply and target:
        c = db.get(Character, target)
        if c is None:
            raise HTTPException(404, "Personaggio non trovato.")
        pg = {"name": c.name, "stats": copy.deepcopy(c.stats or []), "skills": copy.deepcopy(c.skills or []),
              "active_skills": copy.deepcopy(c.active_skills or []), "titles": copy.deepcopy(c.titles or [])}
        messages += apply(entry, pg)
        for f in ("stats", "skills", "active_skills", "titles"):
            _set_json(c, f, pg[f])
        e.assigned_to = c.id
    if data.kind == "npcs":
        n = entry["npc"]
        npc = Npc(name=n["name"][:100], level=n["level"], race=n["race"][:100], place=n["place"][:200], role=n["role"][:200],
                  trust=n["trust"], knows=n["knows"], debts=n["debts"], secret=n["secret"],
                  last=f"Sessione {session} — creato nella Forgia del Master.", history=[])
        db.add(npc)
        db.flush()
        e.npc_id = npc.id
        entry["npc"]["id"] = npc.id
        messages.append(f"«{n['name']}» aggiunto all'archivio PNG.")
    e.summary = entry.get("summary", "")
    e.data = entry
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"entry": entry_out(e, _names(db)), "messages": messages}


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    """Toglie la voce dalla libreria. Non annulla le assegnazioni già fatte ai PG né cancella il PNG creato."""
    e = db.get(ForgeEntry, entry_id)
    if e is None:
        raise HTTPException(404, "Voce della libreria non trovata.")
    db.delete(e)
    db.commit()
    return Response(status_code=204)


@router.post("/drop-profile")
def drop_profile(data: DropProfileIn):
    """Profilo di drop generato al momento (tabella d100) per le creature indicate."""
    cs = forge.valid_creatures({"creatures": data.creatures})
    if not cs:
        raise HTTPException(422, "Servono creature valide (nome, livello 1–999, numero 1–99) per il profilo di drop.")
    if data.kind is not None and data.kind not in [k["name"] for k in rules.DROP_KINDS]:
        raise HTTPException(422, f"Tipo di profilo sconosciuto: {data.kind}.")
    return rules.make_drop_profile(cs, _rng(data.seed), data.kind)


@router.post("/drop-roll")
def drop_roll(data: DropRollIn):
    """«Tira il bottino»: tira i d100 del profilo e scrive il risultato, che il Master può correggere."""
    rows = data.profile.get("rows")
    if not isinstance(rows, list) or not rows:
        raise HTTPException(422, "Profilo di drop non valido: manca la tabella d100.")
    return rules.roll_drop(data.profile, _rng(data.seed))


def _encounter(db: Session, entry_id: int) -> ForgeEntry:
    e = db.get(ForgeEntry, entry_id)
    if e is None or e.kind != "encounters":
        raise HTTPException(404, "Incontro non trovato.")
    return e


def _exp_rows(db: Session, e: ForgeEntry, mode: str) -> list[dict]:
    """EXP di ogni PG che partecipa, ricalcolata sul suo livello attuale (Progressione, Sezione 2, × grado³)."""
    creatures = (e.data or {}).get("creatures") or []
    pcs = [c for c in (db.get(Character, int(i)) for i in (e.data or {}).get("party") or []) if c is not None]
    full = {c.id: rules.exp_for(c.level, creatures)["pct"] for c in pcs}
    share = rules.exp_share(full, mode)
    rows = []
    for c in pcs:
        g = rules.gain_exp(c.level, c.exp_pct, share[c.id])
        rows.append({"id": c.id, "name": c.name, "level": c.level, "exp_pct": rules.clean(rules.num(c.exp_pct)),
                     "full": full[c.id], "pct": share[c.id], "after_level": g["level"], "after_exp": g["exp_pct"], "ups": g["ups"]})
    return rows


@router.get("/encounters/{entry_id}/exp")
def encounter_exp(entry_id: int, mode: Literal["intera", "divisa"] = "intera", db: Session = Depends(get_db)):
    """Anteprima della chiusura: EXP intera o divisa per ogni PG e chi sale di livello."""
    e = _encounter(db, entry_id)
    return {"mode": mode, "party": len((e.data or {}).get("party") or []), "rows": _exp_rows(db, e, mode)}


@router.post("/encounters/{entry_id}/close")
def close_encounter(entry_id: int, data: CloseIn, db: Session = Depends(get_db)):
    """Chiude l'incontro: assegna l'EXP (intera o divisa) e applica i level up (+1 automatico a ogni statistica
    per livello, come POST /characters/{id}/level-up)."""
    e = _encounter(db, entry_id)
    if e.closed:
        raise HTTPException(409, "Incontro già chiuso.")
    rows = _exp_rows(db, e, data.mode)
    lines = []
    for r in rows:
        c = db.get(Character, r["id"])
        old = c.level
        c.exp_pct = r["after_exp"]
        line = f"{c.name}: +{rules.fmt_it(r['pct'])}% EXP"
        combat = copy.deepcopy(c.combat or {})
        rules.add_log(combat, f"Incontro «{e.name}» chiuso: +{rules.fmt_it(r['pct'])}% EXP.")
        if r["ups"]:
            c.level = r["after_level"]
            stats = copy.deepcopy(c.stats or [])
            for s in stats:
                s["levelup"] = rules.clean(rules.num(s.get("levelup")) + rules.LEVEL["auto_per_level"] * r["ups"])
            _set_json(c, "stats", stats)
            rules.add_log(combat, f"Level up: livello {old} → {c.level}. +{rules.LEVEL['auto_per_level'] * r['ups']} a ogni "
                                  f"statistica, +{rules.LEVEL['free_per_level'] * r['ups']} punti liberi.")
            talents = [lv for lv in range(old + 1, c.level + 1) if lv % rules.LEVEL["talent_every"] == 0]
            if talents:
                rules.add_log(combat, f"Nuovo talento disponibile (livello {', '.join(map(str, talents))}) — "
                                      "scelto dal Master in base allo stile di gioco.")
            line += f" · LEVEL UP → Lv {c.level}"
        _set_json(c, "combat", combat)
        lines.append(line)
    e.closed = {"mode": data.mode, "at": _now(), "session": _session(db), "results": rows, "text": "\n".join(lines)}
    flag_modified(e, "closed")
    db.commit()
    db.refresh(e)
    head = f"Incontro «{e.name}» chiuso, EXP {'divisa nel gruppo' if data.mode == 'divisa' else 'intera a ogni PG'}."
    return {"entry": entry_out(e, _names(db)), "results": rows, "messages": [head, *lines]}
