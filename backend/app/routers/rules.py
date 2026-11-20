from fastapi import APIRouter, Depends, HTTPException

from .. import rules
from ..auth import current_user
from ..schemas import PreviewIn
from .characters import starting_inventory  # stessa logica della creazione del PG

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("")
def get_rules():
    return rules.rules_config()


@router.post("/preview", dependencies=[Depends(current_user)])  # calcolo non banale: solo utenti autenticati
def preview(data: PreviewIn):
    c = {"stats": [r.model_dump() for r in data.stats], "item_bonus": data.item_bonus or {},
         "equip": data.equip or {}, "magia": data.magia or {}}
    inventory = data.inventory
    if data.classe_id is not None:
        classe = next((x for x in rules.CLASSES if x["id"] == data.classe_id), None)
        if classe is None:
            raise HTTPException(422, "Classe inesistente.")
        inventory = [*(inventory or []), *starting_inventory(classe, c["stats"], 1)]
    if inventory is not None:
        c = rules.apply_equipment({**c, "inventory": inventory})
    return {"totals": rules.totals(c["stats"]), "derived": rules.derived(c)}
