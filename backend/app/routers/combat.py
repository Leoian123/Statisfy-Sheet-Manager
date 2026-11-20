import copy

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import rules
from ..auth import current_user
from ..db import get_db
from ..models import User
from ..schemas import CombatActionIn, DeathIn, EffectIn
from ..serialize import maxes, maxes_of, rules_input
from .characters import get_char, save, set_json, tidy

router = APIRouter(prefix="/api/characters/{char_id}", tags=["combat"])

n = rules.fmt_n


def _state(c):
    combat = {"position": "Mischia", "turn": 1, "effects": [], "cooldowns": [], "log": [],
              **copy.deepcopy(c.combat or {})}
    resources = copy.deepcopy(c.resources or {"hp": 0, "mp": 0, "sp": 0})
    return combat, resources


def _store(c, combat, resources, clear_death=True):
    set_json(c, "combat", tidy(combat))
    set_json(c, "resources", tidy(resources))
    if clear_death:
        c.death = None  # l'esito della morte resta visibile solo fino all'azione successiva


@router.post("/combat/action")
def combat_action(char_id: int, data: CombatActionIn, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    combat, r = _state(c)
    mx = maxes(c)
    amt = data.amount
    if data.type == "damage":
        rules.apply_damage(r, combat, amt)
    elif data.type == "heal":
        cur = rules.num(r.get("hp"))
        gain = max(0, min(amt, mx["hp"] - cur))
        r["hp"] = min(mx["hp"], cur + amt) if cur < mx["hp"] else cur
        rules.add_log(combat, f"Cura: +{n(gain)} HP. HP {n(r['hp'])}.")
    elif data.type.startswith("restore_"):
        k = data.type.removeprefix("restore_")
        if k not in mx:
            raise HTTPException(422, f"{c.name} non ha la statistica {k.upper()}.")
        cur = rules.num(r.get(k, mx[k]))
        r[k] = max(cur, min(mx[k], cur + amt))
        _store(c, combat, r)
        return save(db, c)
    else:
        k = data.type.removeprefix("spend_")
        L = k.upper()
        if k not in mx:
            raise HTTPException(422, f"{c.name} non ha la statistica {L}.")
        cur = rules.num(r.get(k, mx[k]))
        if cur < amt:
            raise HTTPException(422, f"{L} insufficienti: servono {n(amt)}, disponibili {n(cur)}.")
        r[k] = cur - amt
        rules.add_log(combat, f"Spesi {n(amt)} {L}. {L} {n(r[k])}.")
    _store(c, combat, r)
    return save(db, c)


@router.post("/combat/end-turn")
def combat_end_turn(char_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    combat, r = _state(c)
    ri = rules_input(c)
    ki_regen = next((d["value"] for d in rules.derived(ri) if d["key"] == "kiCombat"), 0)
    rules.end_turn(r, combat, maxes_of(ri), ki_regen)
    _store(c, combat, r)
    return save(db, c)


@router.post("/combat/effects")
def combat_add_effect(char_id: int, data: EffectIn, user: User = Depends(current_user),
                      db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    combat, r = _state(c)
    name = data.name.strip()
    if not name:
        raise HTTPException(422, "Il nome dell'effetto è obbligatorio.")
    text = (data.text or "").strip()
    if not text:
        text = f"Assorbe {n(data.absorb)} danni" if data.absorb else ("Effetto positivo" if data.kind == "good" else "Malus")
    eff = {"name": name, "kind": data.kind, "text": text, "turns": data.turns}
    if data.hpPerTurn:
        eff["hpPerTurn"] = data.hpPerTurn
    if data.absorb:
        eff["absorb"] = data.absorb
    combat["effects"].append(eff)
    rules.add_log(combat, f"Nuovo effetto: {name} ({data.turns} {'turno' if data.turns == 1 else 'turni'}).")
    _store(c, combat, r)
    return save(db, c)


@router.delete("/combat/effects/{index}")
def combat_remove_effect(char_id: int, index: int, name: str | None = Query(None, max_length=200),
                         user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    combat, r = _state(c)
    if not (0 <= index < len(combat["effects"])):
        raise HTTPException(404, "Effetto non trovato.")
    # Con `name` il client dice quale effetto vede in quella posizione: se un'altra sessione ha cambiato la lista, 409
    if name is not None and combat["effects"][index].get("name") != name:
        raise HTTPException(409, "Gli effetti sono cambiati in un'altra sessione: ricarica e riprova.")
    e = combat["effects"].pop(index)
    rules.add_log(combat, f"Effetto rimosso: {e.get('name', '')}.")
    _store(c, combat, r)
    return save(db, c)


@router.post("/combat/reset")
def combat_reset(char_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    combat, r = _state(c)
    combat.update({"turn": 1, "effects": [], "cooldowns": [], "log": []})
    _store(c, combat, r)
    return save(db, c)


@router.post("/death")
def death(char_id: int, data: DeathIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    combat, r = _state(c)
    from_level, from_exp = c.level, rules.num(c.exp_pct)
    p = rules.death_penalty(from_level, from_exp, data.hubris)
    if not p["protected"]:
        c.level = p["level"]
        c.exp_pct = p["exp_pct"]
    mx = maxes(c)  # le statistiche non cambiano con la morte: i massimi restano quelli delle stat
    if data.respawn == "checkpoint":
        r = {k: rules.js_round(mx[k] / 2) for k in rules.resource_keys(mx)}
        parts = " · ".join(f"{rules.RESOURCE_LABELS[k]} {n(r[k])}" for k in r)
        res_line = f"Rinascita al checkpoint: {parts} (50%)."
    else:
        r = {**rules.clamp_resources(r, mx), "hp": 1}  # MP, SP e KI restano come sono (entro il massimo)
        res_line = "Rinascita sul posto: 1 HP."
    combat.update({"turn": 1, "effects": [], "cooldowns": [], "log": []})
    if p["protected"]:
        rules.add_log(combat, f"Morte: livello {n(from_level)} protetto, nessuna perdita di livello.")
        outcome = {"lost": 0, "malus": "", "bonus": "", "protected": True}
    else:
        hub = " (Hubris)" if data.hubris else ""
        rules.add_log(combat, f"Morte{hub}: livello {n(from_level)} · {n(from_exp)}% → "
                              f"{n(c.level)} · {n(c.exp_pct)}%.")
        outcome = {"lost": p["lost"], "malus": p["malus"], "bonus": p["bonus"], "protected": False}
    rules.add_log(combat, res_line)
    _store(c, combat, r, clear_death=False)
    c.death = outcome
    return save(db, c)
