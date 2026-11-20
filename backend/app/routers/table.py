"""Tavolo da gioco (plancia): tiri d100 e richieste di tiro del Master.
Il risultato del d100 lo genera il server con un generatore crittografico (`secrets`): il client riceve
tens/units/natural/total e anima i dadi fino a quei valori, così il giocatore non può truccare il tiro."""
import secrets
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import rules
from ..auth import current_user, require_master
from ..db import get_db
from ..models import Character, Roll, RollRequest, User
from ..serialize import rules_input
from .characters import get_char

router = APIRouter(prefix="/api/table", tags=["table"])

ModKind = Literal["Skill", "Skill attiva", "Titolo", "Talento", "Fortuna"]
FORTUNA_NAME = "Bonus Fortuna sui tiri"
MAX_MODS = 30


class ModIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: ModKind
    name: str = Field(min_length=1, max_length=100)
    mod: int = Field(ge=-999, le=999)
    text: str = Field("", max_length=300)


class CharRollIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field("", max_length=120)
    mods: list[ModIn] = Field(default_factory=list, max_length=MAX_MODS)
    request_id: int | None = None


class MasterRollIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field("", max_length=120)
    secret: bool = False


class RequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    char_id: int
    what: str = Field(min_length=2, max_length=80)
    note: str = Field("", max_length=200)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def d10() -> int:
    """Un d10 (0–9), crittografico e senza distorsione."""
    return secrets.randbelow(10)


def d100() -> tuple[int, int, int]:
    """(decine 0–9, unità 0–9, naturale 1–100): 00 + 0 = 100."""
    tens, units = d10(), d10()
    return tens, units, tens * 10 + units or 100


def _names(db: Session) -> dict[int, str]:
    return {c.id: c.name for c in db.scalars(select(Character)).unique()}


def roll_out(r: Roll, names: dict[int, str], users: dict[int, str]) -> dict:
    return {"id": r.id, "char_id": r.char_id,
            "char_name": "Master" if r.char_id is None else names.get(r.char_id, "PG eliminato"),
            "by": "master" if r.char_id is None else "giocatore", "author_id": r.author_id,
            "author_name": users.get(r.author_id, ""), "reason": r.reason, "tens": r.tens, "units": r.units,
            "natural": r.natural, "mods": r.mods or [], "total": r.total, "secret": bool(r.secret),
            "request_id": r.request_id, "created_at": r.created_at}


def request_out(q: RollRequest, names: dict[int, str], rolls: dict[int, Roll]) -> dict:
    roll = rolls.get(q.roll_id) if q.roll_id else None
    return {"id": q.id, "char_id": q.char_id, "char_name": names.get(q.char_id, "PG eliminato"), "what": q.what,
            "note": q.note, "status": q.status, "roll_id": q.roll_id,
            "roll_total": roll.total if roll else None, "roll_natural": roll.natural if roll else None,
            "created_at": q.created_at}


def _users(db: Session) -> dict[int, str]:
    return {u.id: u.display_name for u in db.scalars(select(User))}


def _attachable(c: Character) -> dict[str, set[str]]:
    """Nomi allegabili per tipo, presi dalla scheda del PG."""
    names = lambda xs: {str(x.get("name")) for x in (xs or []) if isinstance(x, dict) and x.get("name")}  # noqa: E731
    ri = rules_input(c)
    has_luck = any(d["key"] == "bonusFortuna" for d in rules.derived(ri))
    return {"Skill": names(c.skills), "Skill attiva": names(c.active_skills), "Titolo": names(c.titles),
            "Talento": names(c.talents), "Fortuna": {FORTUNA_NAME} if has_luck else set()}


def _check_mods(c: Character, mods: list[ModIn]) -> list[dict]:
    allowed = _attachable(c)
    out = []
    for m in mods:
        if m.name not in allowed[m.kind]:
            raise HTTPException(422, f"«{m.name}» non è tra le voci di tipo {m.kind} nella scheda di {c.name}.")
        out.append({"kind": m.kind, "name": m.name, "mod": m.mod, "text": m.text.strip()})
    return out


def _my_char_ids(db: Session, user: User) -> list[int]:
    return list(db.scalars(select(Character.id).where(Character.owner_id == user.id)))


@router.post("/characters/{char_id}/rolls", status_code=201)
def roll_for_character(char_id: int, data: CharRollIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Tiro d100 di un PG con gli allegati. Il giocatore tira solo per i propri PG, il Master per tutti.
    Se `request_id` è una richiesta aperta di quel PG, diventa `risolta` (altrimenti viene ignorata)."""
    c = get_char(char_id, user, db)
    mods = _check_mods(c, data.mods)
    tens, units, natural = d100()
    req = db.get(RollRequest, data.request_id) if data.request_id is not None else None
    if req is not None and (req.char_id != c.id or req.status != "aperta"):
        req = None
    r = Roll(char_id=c.id, author_id=user.id, reason=data.reason.strip(), tens=tens, units=units, natural=natural,
             mods=mods, total=natural + sum(m["mod"] for m in mods), secret=False,
             request_id=req.id if req else None, created_at=_now())
    db.add(r)
    db.flush()
    if req is not None:
        # UPDATE condizionato: con due risposte contemporanee solo la prima trova la richiesta ancora aperta
        done = db.execute(update(RollRequest).where(RollRequest.id == req.id, RollRequest.status == "aperta")
                          .values(status="risolta", roll_id=r.id).execution_options(synchronize_session=False))
        if done.rowcount != 1:
            r.request_id = None  # già risolta da un'altra sessione: il tiro resta, non collegato
    db.commit()
    db.refresh(r)
    return roll_out(r, {c.id: c.name}, {user.id: user.display_name})


@router.post("/rolls", status_code=201)
def master_roll(data: MasterRollIn, user: User = Depends(require_master), db: Session = Depends(get_db)):
    """Tiro del Master (nessun PG). `secret` = visibile solo al Master."""
    tens, units, natural = d100()
    r = Roll(char_id=None, author_id=user.id, reason=data.reason.strip(), tens=tens, units=units, natural=natural,
             mods=[], total=natural, secret=data.secret, created_at=_now())
    db.add(r)
    db.commit()
    db.refresh(r)
    return roll_out(r, {}, {user.id: user.display_name})


@router.get("/rolls")
def list_rolls(char_id: int | None = None, limit: int = Query(50, ge=1, le=200),
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Tiri dal più recente. Il giocatore vede quelli dei suoi PG; il Master tutti, segreti compresi."""
    q = select(Roll).order_by(Roll.id.desc()).limit(limit)
    if user.role != "master":
        q = q.where(Roll.char_id.in_(_my_char_ids(db, user)), Roll.secret.is_(False))
    if char_id is not None:
        q = q.where(Roll.char_id == char_id)
    names, users = _names(db), _users(db)
    return [roll_out(r, names, users) for r in db.scalars(q)]


@router.post("/requests", status_code=201)
def create_request(data: RequestIn, user: User = Depends(require_master), db: Session = Depends(get_db)):
    """Il Master chiede un tiro d100 a un PG: il giocatore la vede sulla sua plancia."""
    c = db.get(Character, data.char_id)
    if c is None:
        raise HTTPException(404, "Personaggio non trovato.")
    q = RollRequest(char_id=c.id, what=data.what.strip(), note=data.note.strip(), status="aperta", created_at=_now())
    db.add(q)
    db.commit()
    db.refresh(q)
    return request_out(q, {c.id: c.name}, {})


@router.get("/requests")
def list_requests(status: Literal["aperta", "risolta"] | None = None, limit: int = Query(50, ge=1, le=200),
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Richieste di tiro dalla più recente. Il giocatore vede quelle dei suoi PG, il Master tutte."""
    q = select(RollRequest).order_by(RollRequest.id.desc()).limit(limit)
    if user.role != "master":
        q = q.where(RollRequest.char_id.in_(_my_char_ids(db, user)))
    if status:
        q = q.where(RollRequest.status == status)
    reqs = list(db.scalars(q))
    ids = [x.roll_id for x in reqs if x.roll_id]
    rolls = {r.id: r for r in db.scalars(select(Roll).where(Roll.id.in_(ids)))} if ids else {}
    names = _names(db)
    return [request_out(x, names, rolls) for x in reqs]


@router.delete("/requests/{request_id}", status_code=204)
def cancel_request(request_id: int, user: User = Depends(require_master), db: Session = Depends(get_db)):
    """Annulla (elimina) una richiesta di tiro. Il tiro di risposta, se c'è, resta nel registro."""
    q = db.get(RollRequest, request_id)
    if q is None:
        raise HTTPException(404, "Richiesta di tiro non trovata.")
    db.delete(q)
    db.commit()
    return Response(status_code=204)
