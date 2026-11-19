from fastapi import APIRouter

from .. import rules
from ..schemas import PreviewIn

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("")
def get_rules():
    return rules.rules_config()


@router.post("/preview")
def preview(data: PreviewIn):
    c = {"stats": [r.model_dump() for r in data.stats], "item_bonus": data.item_bonus or {},
         "equip": data.equip or {}, "magia": data.magia or {}}
    return {"totals": rules.totals(c["stats"]), "derived": rules.derived(c)}
