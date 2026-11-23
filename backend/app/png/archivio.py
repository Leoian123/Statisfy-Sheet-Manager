"""Le schede dei PNG nel database (tabella `npcs`): nome e livello nelle colonne, il resto in `scheda`.
Un solo posto per salvarle, usato dalla pagina Mondo → PNG e dal wizard PNG della Forgia."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..models import Npc


def salva(db: Session, s: dict, n: Npc | None = None) -> Npc:
    resto = {k: v for k, v in s.items() if k not in ("nome", "livello", "dettaglio", "db_id")}
    if n is None and resto.get("id"):
        # l'id stabile («alba-chiara/bram-ferraguto») non si ripete: due omonimi diventano …-2, …-3
        usati = {(x or {}).get("id") for x in db.scalars(select(Npc.scheda).where(Npc.scheda.is_not(None)))}
        base, k = resto["id"], 2
        while resto["id"] in usati:
            resto["id"] = f"{base}-{k}"
            k += 1
    if n is None:
        n = Npc(name=s["nome"][:100], level=int(s.get("livello") or 1), history=[])
        db.add(n)
    else:
        n.name, n.level = s["nome"][:100], int(s.get("livello") or 1)
    n.race = str(s.get("razza") or "")[:100]
    n.role = str(s.get("ruolo") or "")[:200]
    n.place = str(s.get("luogo") or (s.get("provenienza") or {}).get("luogo") or "")[:200]
    n.dettaglio = s.get("dettaglio") or "scheda"
    n.scheda = resto
    flag_modified(n, "scheda")
    return n


def nomi_usati(db: Session) -> set[str]:
    return set(db.scalars(select(Npc.name)))
