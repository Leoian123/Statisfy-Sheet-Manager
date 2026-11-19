from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..auth import require_master
from ..db import get_db
from ..models import Campaign, Issue, Npc, User
from ..schemas import InteractionIn, IssuePatch, NpcCreate, NpcPatch
from ..serialize import campaign_out, issue_out, npc_out

router = APIRouter(prefix="/api", tags=["master"], dependencies=[Depends(require_master)])


def _campaign(db: Session) -> Campaign:
    c = db.scalar(select(Campaign).order_by(Campaign.id))
    if c is None:
        raise HTTPException(404, "Nessuna campagna presente.")
    return c


def _npc(db: Session, npc_id: int) -> Npc:
    n = db.get(Npc, npc_id)
    if n is None:
        raise HTTPException(404, "PNG non trovato.")
    return n


@router.get("/campaign")
def get_campaign(db: Session = Depends(get_db)):
    return campaign_out(_campaign(db))


@router.post("/campaign/session")
def next_session(db: Session = Depends(get_db)):
    c = _campaign(db)
    c.session += 1
    db.commit()
    return campaign_out(c)


@router.get("/npcs")
def list_npcs(db: Session = Depends(get_db)):
    return [npc_out(n) for n in db.scalars(select(Npc).order_by(Npc.id))]


@router.post("/npcs", status_code=201)
def create_npc(data: NpcCreate, db: Session = Depends(get_db)):
    n = Npc(**data.model_dump(), history=[])
    db.add(n)
    db.commit()
    return npc_out(n)


@router.patch("/npcs/{npc_id}")
def patch_npc(npc_id: int, data: NpcPatch, db: Session = Depends(get_db)):
    n = _npc(db, npc_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(n, k, v)
    db.commit()
    return npc_out(n)


@router.post("/npcs/{npc_id}/interactions")
def add_interaction(npc_id: int, data: InteractionIn, db: Session = Depends(get_db)):
    n = _npc(db, npc_id)
    session = _campaign(db).session
    text = data.text.strip()
    if not text:
        raise HTTPException(422, "Il testo dell'interazione è obbligatorio.")
    at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    n.history = [*(n.history or []), {"session": session, "text": text, "at": at}]
    flag_modified(n, "history")
    n.last = f"Sessione {session} — {text}"
    db.commit()
    return npc_out(n)


@router.get("/issues")
def list_issues(db: Session = Depends(get_db)):
    return [issue_out(i) for i in db.scalars(select(Issue).order_by(Issue.id))]


@router.patch("/issues/{issue_id}")
def patch_issue(issue_id: int, data: IssuePatch, db: Session = Depends(get_db)):
    i = db.get(Issue, issue_id)
    if i is None:
        raise HTTPException(404, "Questione non trovata.")
    fields = data.model_dump(exclude_unset=True)
    if "resolved" in fields and fields["resolved"] is not None:
        i.resolved = fields["resolved"]
    if "decision" in fields:
        i.decision = (fields["decision"] or "").strip() or None
    db.commit()
    return issue_out(i)
