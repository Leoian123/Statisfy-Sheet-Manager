import copy
import re

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import rules
from ..auth import current_user
from ..db import get_db
from ..errors import validate
from ..models import Character, User
from ..schemas import (LOCKED_FIELDS, MASTER_FIELDS, MAX_LEVEL, PLAYER_FIELDS, CharacterCreate, CharacterPatch,
                       DistributeIn)
from ..serialize import character_out, maxes, maxes_of, summary_out

router = APIRouter(prefix="/api/characters", tags=["characters"])

NAME_RE = re.compile(r"^[A-Za-z0-9À-ÖØ-öø-ÿ]+$")


def get_char(char_id: int, user: User, db: Session) -> Character:
    c = db.get(Character, char_id)
    if c is None or (user.role != "master" and c.owner_id != user.id):
        raise HTTPException(404, "Personaggio non trovato.")
    return c


def set_json(c: Character, field: str, value) -> None:
    setattr(c, field, value)
    flag_modified(c, field)


def tidy(v):
    """Converte i float interi in int (2410.0 → 2410), ricorsivamente."""
    if isinstance(v, float):
        return rules.clean(v)
    if isinstance(v, dict):
        return {k: tidy(x) for k, x in v.items()}
    if isinstance(v, list):
        return [tidy(x) for x in v]
    return v


def starting_inventory(classe: dict, stats: list[dict], level: int) -> list[dict]:
    """Equipaggiamento di classe (Comune) + 20 Corone; indossa subito ciò che ha i requisiti soddisfatti."""
    items = [{"rarity": "Comune", "qty": 1, **copy.deepcopy(e)} for e in classe["equip"]]
    items.append({"name": "Corone d'Oro", "stats_text": "Moneta di Valeria", "rarity": "Comune", "type": "Monete",
                  "qty": 20, "weight": 0})
    inv = rules.normalize_inventory(items)
    rules.ensure_item_ids(inv)
    return rules.starting_equipment({"stats": stats, "level": level, "inventory": inv})


def save(db: Session, c: Character) -> dict:
    db.commit()
    db.refresh(c)
    return character_out(c)


@router.get("")
def list_characters(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Character).order_by(Character.id)
    if user.role != "master":
        q = q.where(Character.owner_id == user.id)
    return [summary_out(c) for c in db.scalars(q).unique()]


@router.get("/{char_id}")
def get_character(char_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return character_out(get_char(char_id, user, db))


@router.post("", status_code=201)
def create_character(data: CharacterCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    name = data.name.strip()
    cr = rules.CREATION
    if not (cr["name_min"] <= len(name) <= cr["name_max"]):
        raise HTTPException(422, f"Il nome deve avere da {cr['name_min']} a {cr['name_max']} caratteri.")
    if not NAME_RE.match(name):
        raise HTTPException(422, "Il nome può contenere solo lettere e numeri, senza spazi.")
    if db.scalar(select(Character).where(Character.name_key == name.lower())):
        raise HTTPException(422, f"Esiste già un personaggio di nome {name}.")
    values = data.stats.model_dump()
    low = [k for k, v in values.items() if v < cr["min"]]
    if low:
        raise HTTPException(422, f"Ogni statistica deve valere almeno {cr['min']} ({', '.join(low)}).")
    spent = sum(v - cr["base"] for v in values.values())
    if spent != cr["bonus_points"]:
        raise HTTPException(422, f"Vanno distribuiti esattamente {cr['bonus_points']} punti bonus (ora {spent}).")
    classe = next((k for k in rules.CLASSES if k["id"] == data.classe_id), None)
    if classe is None:
        raise HTTPException(422, "Classe inesistente.")
    regno = next((k for k in rules.KINGDOMS if k["id"] == data.regno_id), None)
    if regno is None:
        raise HTTPException(422, "Regno inesistente.")
    owner_id = user.id
    if data.owner_id is not None and data.owner_id != user.id:
        if user.role != "master":
            raise HTTPException(403, "Solo il Master può creare personaggi per altri giocatori.")
        if db.get(User, data.owner_id) is None:
            raise HTTPException(422, "Proprietario inesistente.")
        owner_id = data.owner_id

    stats = [{"code": code, "name": rules.STAT_NAMES[code], "kind": "base", "iniziale": cr["base"],
              "creazione": values[code] - cr["base"], "investiti": 0, "levelup": 0, "altro": 0, "titoli": 0,
              "note": None} for code in rules.BASE_STATS]
    c = Character(
        owner_id=owner_id, name=name, name_key=name.lower(), classe=classe["name"], level=1, exp_pct=0,
        regno=regno["name"], pvp="Bianco", corone=20, scellini=0, gilda={"nome": "—", "ruolo": "Nessuna gilda"},
        stats=stats, item_bonus={}, equip={"difesa": 0, "difesaMagica": 0, "blocco": 0},
        magia={"nucleo": 0, "talenti": 0},
        titles=[], skills=[], talents=[], pets=[], curses=[], quests=[], reputation=[],
        active_skills=[{"name": classe["skill"], "effect": classe["skill_text"], "lvl": 1, "pct": 0,
                        "cost": classe["cost"], "cd": classe["cooldown"]}],
        inventory=starting_inventory(classe, stats, 1),
        combat={"position": "Mischia", "turn": 1, "effects": [], "cooldowns": [], "log": []},
        death=None,
    )
    c.resources = maxes(c)
    db.add(c)
    return save(db, c)


def merge_stats(old: list[dict], rows: list[dict]) -> list[dict]:
    """Righe di statistica dal Master: tiene le colonne calcolate (oggetti) già salvate, scarta `total`."""
    prev = {r.get("code"): r for r in old}
    out = []
    for r in rows:
        before = prev.get(r["code"], {})
        for k in rules.COMPUTED_SOURCES:
            sent = r.pop(k, None)
            stored = rules.num(before.get(k))
            if sent is not None and rules.num(sent) != stored:
                raise HTTPException(422, f"{r['code']}: la colonna «{k.capitalize()}» è calcolata e non si modifica.")
            if k in before:
                r[k] = before[k]
        r.pop("total", None)
        r["note"] = (r.get("note") or "").strip() or None
        out.append(r)
    return out


@router.patch("/{char_id}")
def patch_character(char_id: int, body: dict = Body(...), user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    locked = sorted(k for k in body if k in LOCKED_FIELDS)
    if locked:
        raise HTTPException(422, f"Campo non modificabile: {', '.join(locked)}.")
    if user.role != "master":
        denied = sorted(k for k in body if k in MASTER_FIELDS)
        if denied:
            raise HTTPException(403, f"Solo il Master può modificare: {', '.join(denied)}.")
    data = validate(CharacterPatch, body)
    fields = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    combat_patch = fields.pop("combat", None)
    if combat_patch is not None and combat_patch["position"] not in rules.POSITIONS:
        raise HTTPException(422, f"Posizione non valida: {combat_patch['position']}.")
    if "stats" in fields:
        fields["stats"] = merge_stats(c.stats or [], fields["stats"])
    fields = {k: tidy(v) for k, v in fields.items() if k in PLAYER_FIELDS or k in MASTER_FIELDS}
    if "inventory" in fields:
        # Inventario MMORPG: id agli oggetti e slot coerenti (i requisiti no: il Master può forzare)
        inv = rules.normalize_inventory(fields["inventory"])
        rules.ensure_item_ids(inv)
        problem = rules.validate_equipment(inv)
        if problem:
            raise HTTPException(422, problem)
        fields["inventory"] = inv

    # Regole: controlla lo stato risultante prima di toccare il personaggio
    errs = rules.sheet_errors({**fields, "stats": fields.get("stats", c.stats or []), "_changed": set(fields)})
    after = {"stats": fields.get("stats", c.stats or []), "equip": fields.get("equip", c.equip or {}),
             "magia": fields.get("magia", c.magia or {}), "item_bonus": fields.get("item_bonus", c.item_bonus or {}),
             "inventory": fields.get("inventory", c.inventory or [])}
    new_max = maxes_of(rules.apply_equipment(after))  # massimi con gli oggetti indossati
    if "resources" in fields:
        errs += rules.resource_errors(fields["resources"], new_max)
        if not errs:  # il KI non inviato resta quello salvato
            fields["resources"] = rules.clamp_resources({**(c.resources or {}), **{k: v for k, v in fields["resources"].items() if v is not None}}, new_max)
    if errs:
        raise HTTPException(422, " ".join(errs[:3]) + (f" (e altri {len(errs) - 3})" if len(errs) > 3 else ""))

    for k, v in fields.items():
        setattr(c, k, v)
        if isinstance(v, (dict, list)):
            flag_modified(c, k)
    if "resources" not in fields and {"stats", "equip", "magia", "item_bonus", "inventory"} & set(fields):
        # Se i massimi scendono, le risorse correnti non li superano
        res = rules.clamp_resources(c.resources, new_max)
        if res != (c.resources or {}):
            set_json(c, "resources", res)
    if combat_patch is not None:
        pos = combat_patch["position"]
        combat = copy.deepcopy(c.combat or {})
        if combat.get("position") != pos:
            combat["position"] = pos
            rules.add_log(combat, f"Posizione: {pos}.")
        set_json(c, "combat", combat)
    return save(db, c)


@router.delete("/{char_id}", status_code=204)
def delete_character(char_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "master":
        raise HTTPException(403, "Solo il Master può eliminare un personaggio.")
    c = get_char(char_id, user, db)
    db.delete(c)
    db.commit()
    return Response(status_code=204)


@router.post("/{char_id}/level-up")
def level_up(char_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    old = c.level
    if old >= MAX_LEVEL:
        raise HTTPException(422, f"Livello massimo raggiunto ({rules.fmt_n(MAX_LEVEL)}).")
    c.level = old + 1
    c.exp_pct = 0
    stats = copy.deepcopy(c.stats or [])
    for r in stats:
        r["levelup"] = rules.clean(rules.num(r.get("levelup")) + rules.LEVEL["auto_per_level"])
    set_json(c, "stats", stats)
    combat = copy.deepcopy(c.combat or {})
    rules.add_log(combat, f"Level up: livello {rules.fmt_n(old)} → {rules.fmt_n(c.level)}. "
                          f"+{rules.LEVEL['auto_per_level']} a ogni statistica, "
                          f"+{rules.LEVEL['free_per_level']} punti liberi.")
    if c.level % rules.LEVEL["talent_every"] == 0:
        rules.add_log(combat, f"Nuovo talento disponibile (livello {rules.fmt_n(c.level)}) — "
                              "scelto dal Master in base allo stile di gioco.")
    set_json(c, "combat", combat)
    return save(db, c)


@router.post("/{char_id}/distribute")
def distribute(char_id: int, data: DistributeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    stats = copy.deepcopy(c.stats or [])
    codes = {r["code"] for r in stats}
    unknown = sorted(k for k in data.alloc if k not in codes)
    if unknown:
        raise HTTPException(422, f"Statistica inesistente: {', '.join(unknown)}.")
    neg = sorted(k for k, v in data.alloc.items() if v < 0)
    if neg:
        raise HTTPException(422, f"I punti non possono essere negativi ({', '.join(neg)}).")
    total = sum(data.alloc.values())
    if total <= 0:
        raise HTTPException(422, "Nessun punto da distribuire.")
    left = rules.free_points(c.level, stats)["left"]
    if total > left:
        raise HTTPException(422, f"Punti insufficienti: richiesti {total}, disponibili {left}.")
    parts = []
    for r in stats:
        p = data.alloc.get(r["code"], 0)
        if p > 0:
            r["investiti"] = rules.clean(rules.num(r.get("investiti")) + p)
            parts.append(f"{r['code']} +{p}")
    set_json(c, "stats", stats)
    combat = copy.deepcopy(c.combat or {})
    rules.add_log(combat, f"Distribuzione confermata: {' · '.join(parts)}.")
    set_json(c, "combat", combat)
    return save(db, c)
