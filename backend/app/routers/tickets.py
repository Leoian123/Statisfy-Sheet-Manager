"""Richieste dei giocatori al Master: proposte di funzioni, di contenuti e domande sul regolamento.

Ciclo di vita: aperta → in_esame → risolta | respinta; l'autore può ritirarla finché non è chiusa.
Archiviazione (logrotate): una richiesta chiusa da più di `config.TICKET_ARCHIVE_DAYS` giorni passa in archivio
(`archived_at`) a ogni lettura dell'elenco, all'avvio e con «Archivia ora» del Master. In archivio è solo leggibile.
Una domanda sul regolamento risolta può diventare una «Questione delle regole» decisa (Area Master).

Permessi: il giocatore vede e scrive solo le sue richieste; il Master le vede tutte e ne cambia lo stato."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import config
from ..auth import current_user, require_master
from ..db import get_db
from ..models import Character, Issue, Ticket, User
import threading

from .journal import _clean_text, _like

_CREATE_LOCK = threading.Lock()  # conteggio + inserimento atomici (un solo worker, vedi docs/DEPLOY.md)

router = APIRouter(prefix="/api/tickets", tags=["tickets"])

Kind = Literal["funzione", "contenuto", "regola"]
Status = Literal["aperta", "in_esame", "risolta", "respinta", "ritirata"]
ACTIVE = ("aperta", "in_esame")
CLOSED = ("risolta", "respinta", "ritirata")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.isoformat(timespec="seconds")


def _line(s: str) -> str:
    return " ".join(_clean_text(s).split())


class TicketIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Kind
    title: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=1, max_length=5000)
    char_id: int | None = None


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=2000)


class TicketPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int | None = None
    status: Status | None = None
    answer: str | None = Field(None, max_length=5000)
    title: str | None = Field(None, min_length=3, max_length=120)
    body: str | None = Field(None, min_length=1, max_length=5000)
    promote_issue: bool = False  # solo Master, solo domande sul regolamento risolte


def rotate(db: Session, now: datetime | None = None) -> int:
    """Archivia le richieste chiuse da almeno TICKET_ARCHIVE_DAYS giorni. Ritorna quante. Idempotente."""
    now = now or _now()
    limit = _iso(now - timedelta(days=config.TICKET_ARCHIVE_DAYS))
    res = db.execute(update(Ticket)
                     .where(Ticket.archived_at.is_(None), Ticket.status.in_(CLOSED), Ticket.closed_at.is_not(None),
                            Ticket.closed_at <= limit)
                     .values(archived_at=_iso(now), version=Ticket.version + 1)
                     .execution_options(synchronize_session=False))
    db.commit()
    return res.rowcount or 0


def _names(db: Session) -> dict[int, str]:
    return {u.id: u.display_name for u in db.scalars(select(User))}


def _out(t: Ticket, names: dict[int, str], chars: dict[int, str], user: User) -> dict:
    archive_at = None
    if t.closed_at and not t.archived_at:
        archive_at = _iso(datetime.fromisoformat(t.closed_at) + timedelta(days=config.TICKET_ARCHIVE_DAYS))
    return {"id": t.id, "author_id": t.author_id, "author_name": names.get(t.author_id, "—"), "mine": t.author_id == user.id,
            "char_id": t.char_id, "char_name": chars.get(t.char_id) if t.char_id else None,
            "kind": t.kind, "title": t.title, "body": t.body, "status": t.status, "answer": t.answer or "",
            "messages": t.messages or [], "issue_id": t.issue_id,
            "unread": (t.author_id == user.id and not t.seen_by_author),
            "created_at": t.created_at, "updated_at": t.updated_at, "closed_at": t.closed_at,
            "archived_at": t.archived_at, "archive_at": archive_at, "version": t.version}


def _chars(db: Session) -> dict[int, str]:
    return {c.id: c.name for c in db.scalars(select(Character))}


def _get(db: Session, user: User, ticket_id: int) -> Ticket:
    t = db.get(Ticket, ticket_id)
    if t is None or (user.role != "master" and t.author_id != user.id):
        raise HTTPException(404, "Richiesta non trovata.")
    return t


def _editable(t: Ticket) -> None:
    if t.archived_at:
        raise HTTPException(409, "La richiesta è in archivio: non si modifica più.")


@router.get("/summary")
def summary(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Contatori per il menu: Master = richieste nuove (aperte); giocatore = sue richieste con risposte non lette."""
    if user.role == "master":
        n = db.scalar(select(func.count()).select_from(Ticket).where(Ticket.status == "aperta", Ticket.archived_at.is_(None)))
    else:
        n = db.scalar(select(func.count()).select_from(Ticket)
                      .where(Ticket.author_id == user.id, Ticket.seen_by_author.is_(False), Ticket.archived_at.is_(None)))
    return {"count": n or 0}


@router.get("")
def list_tickets(scope: Literal["attive", "archivio"] = "attive", status: Status | None = None, kind: Kind | None = None,
                 q: str | None = Query(None, max_length=100), limit: int = Query(50, ge=1, le=200),
                 offset: int = Query(0, ge=0, le=100000),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    rotate(db)
    base = [] if user.role == "master" else [Ticket.author_id == user.id]
    cond = [*base, Ticket.archived_at.is_(None) if scope == "attive" else Ticket.archived_at.is_not(None)]
    if status:
        cond.append(Ticket.status == status)
    if kind:
        cond.append(Ticket.kind == kind)
    order = (Ticket.updated_at.desc(), Ticket.id.desc()) if scope == "attive" else (Ticket.archived_at.desc(), Ticket.id.desc())
    if q and q.strip():
        pat = _like(q.strip().lower())
        cond.append(or_(*(func.lower(c).like(pat, escape="\\") for c in (Ticket.title, Ticket.body, Ticket.answer))))
    total = db.scalar(select(func.count()).select_from(Ticket).where(*cond)) or 0
    rows = list(db.scalars(select(Ticket).where(*cond).order_by(*order).limit(limit).offset(offset)))
    counts = {s: 0 for s in (*ACTIVE, *CLOSED)}
    for s, n in db.execute(select(Ticket.status, func.count()).where(*base, Ticket.archived_at.is_(None)).group_by(Ticket.status)):
        counts[s] = n
    counts["archivio"] = db.scalar(select(func.count()).select_from(Ticket).where(*base, Ticket.archived_at.is_not(None))) or 0
    names, chars = _names(db), _chars(db)
    return {"total": total, "counts": counts, "archive_days": config.TICKET_ARCHIVE_DAYS,
            "items": [_out(t, names, chars, user) for t in rows]}


@router.post("", status_code=201)
def create_ticket(data: TicketIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    with _CREATE_LOCK:
        return _create_ticket(data, user, db)


def _create_ticket(data: TicketIn, user: User, db: Session):
    since = _iso(_now() - timedelta(days=1))
    today = db.scalar(select(func.count()).select_from(Ticket)
                      .where(Ticket.author_id == user.id, Ticket.created_at >= since)) or 0
    if today >= config.TICKET_MAX_PER_DAY:
        raise HTTPException(429, f"Massimo {config.TICKET_MAX_PER_DAY} richieste in 24 ore: riprova domani.")
    active = db.scalar(select(func.count()).select_from(Ticket)
                       .where(Ticket.author_id == user.id, Ticket.status.in_(ACTIVE))) or 0
    if active >= config.TICKET_MAX_ACTIVE:
        raise HTTPException(429, f"Hai già {active} richieste in attesa: aspetta che il Master ne chiuda qualcuna.")
    title, body = _line(data.title), _clean_text(data.body).strip()
    if len(title) < 3 or not body:
        raise HTTPException(422, "Scrivi un titolo (almeno 3 caratteri) e il testo della richiesta.")
    if data.char_id is not None:
        c = db.get(Character, data.char_id)
        if c is None or (user.role != "master" and c.owner_id != user.id):
            raise HTTPException(404, "Personaggio non trovato.")
    now = _iso(_now())
    t = Ticket(author_id=user.id, char_id=data.char_id, kind=data.kind, title=title, body=body, status="aperta",
               answer="", messages=[], seen_by_author=True, created_at=now, updated_at=now)
    db.add(t)
    db.commit()
    return _out(t, _names(db), _chars(db), user)


@router.get("/{ticket_id}")
def get_ticket(ticket_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = _get(db, user, ticket_id)
    if t.author_id == user.id and not t.seen_by_author:
        # letta dall'autore: UPDATE diretto senza cambiare `version`, così chi ha la richiesta aperta (il Master)
        # non riceve un 409 solo perché l'autore l'ha letta
        db.execute(update(Ticket).where(Ticket.id == t.id).values(seen_by_author=True)
                   .execution_options(synchronize_session=False))
        db.commit()
        db.refresh(t)
    return _out(t, _names(db), _chars(db), user)


@router.post("/{ticket_id}/messages")
def add_message(ticket_id: int, data: MessageIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = _get(db, user, ticket_id)
    _editable(t)
    msgs = list(t.messages or [])
    if len(msgs) >= config.TICKET_MAX_MESSAGES:
        raise HTTPException(422, f"Massimo {config.TICKET_MAX_MESSAGES} messaggi per richiesta: aprine una nuova.")
    text = _clean_text(data.text).strip()
    if not text:
        raise HTTPException(422, "Il messaggio è vuoto.")
    now = _iso(_now())
    msgs.append({"by": user.id, "by_name": user.display_name, "role": user.role, "text": text, "at": now})
    t.messages = msgs
    flag_modified(t, "messages")
    t.updated_at = now
    if user.id != t.author_id:
        t.seen_by_author = False
    db.commit()
    return _out(t, _names(db), _chars(db), user)


@router.patch("/{ticket_id}")
def patch_ticket(ticket_id: int, data: TicketPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = _get(db, user, ticket_id)
    _editable(t)
    if data.version is not None and data.version != t.version:
        raise HTTPException(409, "La richiesta è cambiata in un'altra sessione: ricarica e riprova.")
    f = data.model_dump(exclude_unset=True)
    master = user.role == "master"
    now = _now()
    if not master:
        # Il giocatore: ritira la sua richiesta o corregge titolo e testo finché nessuno l'ha presa in esame
        if "answer" in f or data.promote_issue or (data.status not in (None, "ritirata")):
            raise HTTPException(403, "Lo stato e la risposta li decide il Master.")
        if data.status == "ritirata" and t.status not in ACTIVE:
            raise HTTPException(409, "La richiesta è già chiusa.")
        if ("title" in f or "body" in f) and t.status != "aperta":
            raise HTTPException(409, "Il Master l'ha già presa in esame: aggiungi un messaggio invece di modificarla.")
    if data.title is not None:
        title = _line(data.title)
        if len(title) < 3:
            raise HTTPException(422, "Il titolo deve avere almeno 3 caratteri.")
        t.title = title
    if data.body is not None:
        body = _clean_text(data.body).strip()
        if not body:
            raise HTTPException(422, "Il testo della richiesta è vuoto.")
        t.body = body
    if master and data.answer is not None:
        t.answer = _clean_text(data.answer).strip()
        if t.author_id != user.id:
            t.seen_by_author = False
    if data.status is not None and data.status != t.status:
        if master and data.status == "ritirata" and t.author_id != user.id:
            raise HTTPException(422, "Solo l'autore ritira una richiesta: il Master la respinge.")
        if data.status in ("risolta", "respinta") and not t.answer.strip():
            raise HTTPException(422, "Scrivi la risposta o la decisione prima di chiudere la richiesta.")
        t.status = data.status
        t.closed_at = _iso(now) if data.status in CLOSED else None
        if t.author_id != user.id:
            t.seen_by_author = False
    if data.promote_issue:
        if t.kind != "regola" or t.status != "risolta":
            raise HTTPException(422, "Solo una domanda sul regolamento risolta diventa una questione delle regole.")
        i = db.get(Issue, t.issue_id) if t.issue_id is not None else None
        if i is None:
            i = Issue(title=t.title, text=t.body, sev="warn", resolved=True, decision=t.answer)
            db.add(i)
            db.flush()
            t.issue_id = i.id
        else:  # già promossa: la decisione segue l'ultima risposta
            i.decision, i.resolved = t.answer, True
    t.updated_at = _iso(now)
    db.commit()
    return _out(t, _names(db), _chars(db), user)


@router.post("/{ticket_id}/archive", dependencies=[Depends(require_master)])
def archive_now(ticket_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Archivia subito una richiesta chiusa (senza aspettare i giorni di conservazione)."""
    t = _get(db, user, ticket_id)
    _editable(t)
    if t.status not in CLOSED:
        raise HTTPException(409, "Si archiviano solo le richieste chiuse (risolte, respinte o ritirate).")
    t.archived_at = _iso(_now())
    db.commit()
    return _out(t, _names(db), _chars(db), user)


@router.post("/rotate", dependencies=[Depends(require_master)])
def rotate_now(db: Session = Depends(get_db)):
    return {"archived": rotate(db), "archive_days": config.TICKET_ARCHIVE_DAYS}
