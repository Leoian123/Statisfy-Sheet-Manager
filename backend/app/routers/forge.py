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

from .. import forge, mech, mech_templates, rules, status_catalog
from ..auth import require_master
from ..db import get_db
from ..models import Campaign, Character, ForgeEntry, Npc
from ..png import archivio
from ..serialize import maxes_of, npc_out, rules_input
from .combat import _state, _store

router = APIRouter(prefix="/api/forge", tags=["forge"], dependencies=[Depends(require_master)])

Kind = Literal["skills", "classes", "races", "titles", "npcs", "encounters", "spells", "miracles", "items"]


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


class AssignIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    char_id: int
    force: bool = False


class LiveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["start", "stop", "next_turn", "damage", "heal"]
    index: int | None = None
    amount: int | None = Field(None, ge=0, le=10 ** 9)


class RestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    char_ids: list[int] | None = Field(None, max_length=200)
    clear_effects: bool = True


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
    return {"chars": [_char_ctx(c) for c in _chars(db)], "library": lib, "npc_names": sorted(archivio.nomi_usati(db))}


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
        "item_bonus": forge.item_bonus_options(),
        "equip_types": [{"key": k, "label": v["label"], "slots": [rules.SLOT_LABELS[x] for x in v["slots"]],
                         "two_handed": bool(v.get("two_handed"))} for k, v in rules.EQUIP_TYPES.items()],
        "assignable": list(forge.ASSIGNABLE),
        "mech": {**mech.vocabulary(), "status": status_catalog.catalog(), "templates": mech_templates.templates()},
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
    messages = [f"{forge.KIND_ONE[data.kind]}: «{entry['name']}» {'aggiunta' if data.kind in forge.KIND_FEMININE else 'aggiunto'} alla libreria."]
    e = ForgeEntry(kind=data.kind, name=entry["name"][:100], summary=entry.get("summary", ""), session=session, created_at=_now())
    apply = forge.apply_fn(data.kind)
    target = entry.get("assignedTo")
    if apply and target:
        c = db.get(Character, target)
        if c is None:
            raise HTTPException(404, "Personaggio non trovato.")
        messages += _apply_to(c, entry, apply)
        e.assigned_to = c.id
        entry["assignments"] = [{"char_id": c.id, "name": c.name, "at": _now(), "session": session}]
    if data.kind == "npcs":
        n = entry["npc"]
        npc = archivio.salva(db, {k: v for k, v in n.items() if k not in ("knows", "debts", "secret")})
        npc.knows, npc.debts, npc.secret = n["knows"], n["debts"], n["secret"]
        npc.last = f"Sessione {session} — creato nella Forgia del Master."
        db.flush()
        e.npc_id = npc.id
        entry["npc"]["id"] = npc.id
        messages.append(f"«{n['nome']}» aggiunto all'archivio PNG (Mondo → PNG).")
    e.summary = entry.get("summary", "")
    entry["events"] = [{"at": _now(), "session": session, "text": m} for m in messages]
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


PG_FIELDS = ("stats", "skills", "active_skills", "titles", "inventory")


def _apply_to(c: Character, entry: dict, apply) -> list[str]:
    """Applica una voce al PG su copie dei campi, poi salva i JSON modificati."""
    pg = {"name": c.name, **{f: copy.deepcopy(getattr(c, f) or []) for f in PG_FIELDS}}
    msgs = apply(entry, pg)
    rules.ensure_item_ids(pg["inventory"])
    for f in PG_FIELDS:
        if pg[f] != (getattr(c, f) or []):
            _set_json(c, f, pg[f])
    return msgs


def _event(db: Session, e: ForgeEntry, text: str) -> None:
    data = dict(e.data or {})
    data["events"] = [*(data.get("events") or []), {"at": _now(), "session": _session(db), "text": text}][-50:]
    e.data = data
    flag_modified(e, "data")


def _entry(db: Session, entry_id: int) -> ForgeEntry:
    e = db.get(ForgeEntry, entry_id)
    if e is None:
        raise HTTPException(404, "Voce della libreria non trovata.")
    return e


def _char(db: Session, char_id: int) -> Character:
    c = db.get(Character, char_id)
    if c is None:
        raise HTTPException(404, "Personaggio non trovato.")
    return c


@router.get("/entries/{entry_id}/assign-preview")
def assign_preview(entry_id: int, char_id: int, db: Session = Depends(get_db)):
    """Cosa succede assegnando la voce al PG: errore bloccante, avvisi (servono `force`), variazioni dei titoli,
    requisiti degli oggetti non soddisfatti."""
    e = _entry(db, entry_id)
    if e.kind not in forge.ASSIGNABLE:
        raise HTTPException(422, "Questo tipo di voce non si assegna a un PG.")
    return forge.assign_preview(e.kind, e.data or {}, _char_ctx(_char(db, char_id)))


@router.post("/entries/{entry_id}/assign")
def assign_entry(entry_id: int, data: AssignIn, db: Session = Depends(get_db)):
    """Assegna a un PG una voce già salvata (titolo, oggetto, skill, incantesimo, miracolo) con le regole del wizard:
    i bonus dei titoli vanno nella colonna «Titoli» e l'evoluzione sostituisce il precedente; l'oggetto va nella borsa."""
    e = _entry(db, entry_id)
    if e.kind not in forge.ASSIGNABLE:
        raise HTTPException(422, "Questo tipo di voce non si assegna a un PG.")
    c = _char(db, data.char_id)
    pv = forge.assign_preview(e.kind, e.data or {}, _char_ctx(c))
    if pv["error"]:
        raise HTTPException(422, pv["error"])
    if pv["issues"] and not data.force:
        raise HTTPException(422, f"{pv['issues'][0]}: conferma per forzare l'assegnazione.")
    entry = copy.deepcopy(e.data or {})
    messages = _apply_to(c, entry, forge.apply_fn(e.kind))
    entry["assignments"] = [*(entry.get("assignments") or []),
                            {"char_id": c.id, "name": c.name, "at": _now(), "session": _session(db), "forced": bool(pv["issues"])}]
    if e.assigned_to is None:
        e.assigned_to = c.id
    e.data = entry
    flag_modified(e, "data")
    _event(db, e, messages[0])
    db.commit()
    db.refresh(e)
    return {"entry": entry_out(e, _names(db)), "messages": messages}


@router.post("/party/rest")
def party_rest(data: RestIn, db: Session = Depends(get_db)):
    """Riposo del gruppo: HP, MP, SP (e KI) al massimo per i PG scelti (tutti se `char_ids` manca).
    Con `clear_effects` toglie anche effetti e cooldown e riporta il turno a 1; l'esito della morte sparisce.
    Una riga nel registro del combattimento di ognuno."""
    chars = _chars(db)
    if data.char_ids is not None:
        want = set(data.char_ids)
        missing = want - {c.id for c in chars}
        if missing:
            raise HTTPException(404, f"Personaggio {min(missing)} non trovato.")
        chars = [c for c in chars if c.id in want]
    rested = []
    for c in chars:
        combat, r = _state(c)
        mx = maxes_of(rules_input(c))
        for k, v in mx.items():
            r[k] = v
        if data.clear_effects:
            combat.update({"turn": 1, "effects": [], "cooldowns": []})
        rules.add_log(combat, "Riposo: risorse al massimo" + (", effetti e ricariche azzerati." if data.clear_effects else "."))
        _store(c, combat, r)
        rested.append({"id": c.id, "name": c.name})
    db.commit()
    return {"rested": rested}


def _live(e: ForgeEntry) -> dict:
    return dict((e.data or {}).get("live") or {})


def _creature_rows(e: ForgeEntry) -> list[dict]:
    return [{"name": c.get("name"), "count": c.get("count", 1), "rarity": c.get("rarity"), "level": c.get("level"),
             "max": rules.clean(rules.num(c.get("hp")) * (int(rules.num(c.get("count"))) or 1))}
            for c in (e.data or {}).get("creatures") or []]


@router.post("/encounters/{entry_id}/live")
def encounter_live(entry_id: int, data: LiveIn, db: Session = Depends(get_db)):
    """Incontro in corso sulla plancia: avvio (uno alla volta), sospensione, turni, Vita delle creature
    (per riga: numero × Vita)."""
    e = _encounter(db, entry_id)
    if e.closed:
        raise HTTPException(409, "Incontro già chiuso.")
    live = _live(e)
    rows = _creature_rows(e)
    if data.action == "start":
        for other in _entries(db, "encounters"):
            if other.id != e.id and _live(other).get("active"):
                other.data = {**(other.data or {}), "live": {**_live(other), "active": False}}
                flag_modified(other, "data")
        live = {"active": True, "turn": live.get("turn") or 1, "hp": live.get("hp") or [r["max"] for r in rows]}
        text = f"Incontro «{e.name}» in corso (turno {live['turn']})."
    elif not live.get("active"):
        raise HTTPException(409, "L'incontro non è in corso: avvialo prima.")
    elif data.action == "stop":
        live["active"] = False
        text = f"Incontro «{e.name}» sospeso al turno {live.get('turn', 1)}."
    elif data.action == "next_turn":
        live["turn"] = int(live.get("turn") or 1) + 1
        text = f"«{e.name}»: turno {live['turn']}."
    else:
        i = data.index
        if i is None or not 0 <= i < len(rows):
            raise HTTPException(422, "Creatura non valida.")
        if not data.amount:
            raise HTTPException(422, "Indica un valore maggiore di 0.")
        hp = list(live.get("hp") or [r["max"] for r in rows])
        sign = -1 if data.action == "damage" else 1
        hp[i] = rules.clean(max(0, min(rows[i]["max"], rules.num(hp[i]) + sign * data.amount)))
        live["hp"] = hp
        text = (f"«{rows[i]['name']}» {'−' if sign < 0 else '+'}{rules.fmt_n(data.amount)} Vita"
                f" ({rules.fmt_n(hp[i])} / {rules.fmt_n(rows[i]['max'])})." + (" Sconfitta." if hp[i] == 0 else ""))
    e.data = {**(e.data or {}), "live": live}
    flag_modified(e, "data")
    _event(db, e, text)
    db.commit()
    db.refresh(e)
    return {"entry": entry_out(e, _names(db)), "message": text}


@router.get("/board")
def board(db: Session = Depends(get_db)):
    """Tutto ciò che serve alla plancia di comando del Master in una chiamata."""
    camp = db.scalar(select(Campaign).order_by(Campaign.id))
    session = camp.session if camp else 1
    party = []
    for c in _chars(db):
        mx = maxes_of(rules_input(c))
        party.append({"id": c.id, "name": c.name, "classe": c.classe, "owner_name": c.owner.display_name if c.owner else "",
                      "level": c.level, "exp_pct": rules.clean(rules.num(c.exp_pct)), "power_rank": rules.power_rank(c.level),
                      "resources": rules.clamp_resources(c.resources, mx), "maxes": mx, "dead": bool(c.death),
                      "effects": [{"name": x.get("name"), "kind": x.get("kind"), "turns": x.get("turns")}
                                  for x in (c.combat or {}).get("effects") or []]})
    entries = _entries(db)
    names = _names(db)
    encounters = []
    for e in entries:
        if e.kind != "encounters" or e.closed:
            continue
        rows = _creature_rows(e)
        live = _live(e)
        hp = live.get("hp") or [r["max"] for r in rows]
        encounters.append({**entry_out(e, names), "live": live,
                           "creatures": [{**r, "hp": hp[i] if i < len(hp) else r["max"]} for i, r in enumerate(rows)]})
    log = sorted(((ev, e) for e in entries for ev in (e.data or {}).get("events") or [] if ev.get("session") == session),
                 key=lambda x: x[0].get("at") or "", reverse=True)[:20]
    return {
        "campaign": {"name": camp.name, "session": session, "master_name": camp.master_name,
                     "open_quests": camp.open_quests or []} if camp else None,
        "party": party,
        "npcs": [npc_out(n) for n in db.scalars(select(Npc).order_by(Npc.id))],
        "encounters": encounters,
        "active_encounter_id": next((x["id"] for x in encounters if x["live"].get("active")), None),
        "library": [entry_out(e, names) for e in entries if e.kind in forge.ASSIGNABLE],
        "counts": {k: sum(1 for e in entries if e.kind == k) for k in forge.KINDS},
        "log": [{"at": ev.get("at"), "text": ev.get("text"), "entry_id": e.id, "kind": e.kind} for ev, e in log],
    }


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
    if _live(e):
        e.data = {**(e.data or {}), "live": {**_live(e), "active": False}}
    _event(db, e, f"Incontro «{e.name}» chiuso, EXP {data.mode}.")
    db.commit()
    db.refresh(e)
    head = f"Incontro «{e.name}» chiuso, EXP {'divisa nel gruppo' if data.mode == 'divisa' else 'intera a ogni PG'}."
    return {"entry": entry_out(e, _names(db)), "results": rows, "messages": [head, *lines]}
