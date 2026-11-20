"""Equipaggiamento stile MMORPG: indossa, togli, sposta tra slot. Regole in rules.py."""
import copy

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import rules
from ..auth import current_user
from ..db import get_db
from ..models import Character, User
from ..schemas import EquipIn, MoveSlotIn, UnequipIn
from ..serialize import maxes, raw_input
from .characters import get_char, save, set_json, tidy

router = APIRouter(prefix="/api/characters/{char_id}/equipment", tags=["equipment"])


def _apply(db: Session, c: Character, fn) -> dict:
    try:
        res = fn(raw_input(c))
    except rules.EquipError as e:
        raise HTTPException(422, str(e))
    set_json(c, "inventory", tidy(res["inventory"]))
    # Le risorse correnti non possono superare i nuovi massimi (es. togliendo un oggetto con VIT)
    mx = maxes(c)
    r = copy.deepcopy(c.resources or {"hp": 0, "mp": 0, "sp": 0})
    res = rules.clamp_resources(r, mx)
    if res != r:
        set_json(c, "resources", tidy(res))
    return save(db, c)


@router.post("/equip")
def equip(char_id: int, data: EquipIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    return _apply(db, c, lambda ri: rules.equip_item(ri, data.item_id, data.slot))


@router.post("/unequip")
def unequip(char_id: int, data: UnequipIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    return _apply(db, c, lambda ri: rules.unequip_slot(ri, data.slot))


@router.post("/move")
def move(char_id: int, data: MoveSlotIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = get_char(char_id, user, db)
    return _apply(db, c, lambda ri: rules.move_item(ri, data.from_slot, data.to_slot))
