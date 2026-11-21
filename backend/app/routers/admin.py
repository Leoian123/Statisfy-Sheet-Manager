"""Amministrazione (solo Master): account, ruoli, password provvisorie, assegnazione dei personaggi, registro.

Protezioni:
- resta sempre almeno un Master attivo (controllo e modifica sotto lo stesso lock);
- il Master non cambia il proprio ruolo né disattiva o elimina se stesso (lo fa un altro Master): niente chiusure fuori;
- cambio di ruolo, disattivazione e password provvisoria disconnettono l'account ovunque;
- si elimina solo un account mai usato (niente PG, tiri, pagine di diario o richieste); gli altri si disattivano,
  così la loro storia resta leggibile e nessun nuovo account eredita dati con lo stesso id."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import accounts
from ..accounts import AccountError
from ..auth import require_master
from ..db import get_db
from ..models import AdminLog, Character, JournalEntry, Roll, Ticket, User
from .journal import _clean_text

router = APIRouter(prefix="/api/admin", tags=["admin"])

Role = Literal["master", "player"]
ROLE_LABEL = {"master": "Master", "player": "Giocatore"}


class UserIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(max_length=100)
    display_name: str = Field("", max_length=100)
    role: Role = "player"
    password: str | None = Field(None, max_length=256)  # assente = password provvisoria generata dal server


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str | None = Field(None, max_length=100)
    display_name: str | None = Field(None, max_length=100)
    role: Role | None = None
    active: bool | None = None


class OwnerIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    owner_id: int


def _line(s: str) -> str:
    return " ".join(_clean_text(s).split())


def _user(db: Session, user_id: int) -> User:
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "Account non trovato.")
    return u


def _out(u: User, me: User, chars: list[Character]) -> dict:
    return {
        "id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role, "active": bool(u.active),
        "must_change_password": bool(u.must_change_password), "created_at": u.created_at or "",
        "last_login_at": u.last_login_at or "", "is_self": u.id == me.id,
        "characters": [{"id": c.id, "name": c.name, "classe": c.classe, "level": c.level} for c in chars],
    }


def _chars_of(db: Session, user_id: int) -> list[Character]:
    return list(db.scalars(select(Character).where(Character.owner_id == user_id).order_by(Character.name)))


def _guard_last_master(db: Session, u: User, becomes_master: bool, stays_active: bool) -> None:
    if u.role == "master" and u.active and not (becomes_master and stays_active) \
            and accounts.other_active_masters(db, u.id) == 0:
        raise HTTPException(409, "Serve almeno un Master attivo: prima promuovi o riattiva un altro Master.")


@router.get("/users")
def list_users(me: User = Depends(require_master), db: Session = Depends(get_db)):
    users = list(db.scalars(select(User).order_by(User.role, func.lower(User.display_name))))
    by_owner: dict[int, list[Character]] = {}
    for c in db.scalars(select(Character).order_by(Character.name)):
        by_owner.setdefault(c.owner_id, []).append(c)
    return [_out(u, me, by_owner.get(u.id, [])) for u in users]


@router.post("/users", status_code=201)
def create_user(data: UserIn, me: User = Depends(require_master), db: Session = Depends(get_db)):
    temp = data.password is None
    password = accounts.temporary_password() if temp else data.password
    try:
        with accounts.LOCK:
            u = accounts.create(db, data.username, password, data.role, _line(data.display_name), must_change=True)
            accounts.log(db, me, "crea", u.username, f"{ROLE_LABEL[u.role]}, nome visibile «{u.display_name}»")
            db.commit()
    except AccountError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    out = {"user": _out(u, me, [])}
    if temp:
        out["temporary_password"] = password  # mostrata una sola volta: il server conserva solo l'hash
    return out


@router.patch("/users/{user_id}")
def patch_user(user_id: int, data: UserPatch, me: User = Depends(require_master), db: Session = Depends(get_db)):
    with accounts.LOCK:
        u = _user(db, user_id)
        changes: list[str] = []
        if u.id == me.id and ((data.role is not None and data.role != u.role) or data.active is False):
            raise HTTPException(409, "Non puoi cambiare il tuo ruolo né disattivarti: chiedilo a un altro Master.")
        new_role = data.role if data.role is not None else u.role
        new_active = data.active if data.active is not None else bool(u.active)
        _guard_last_master(db, u, new_role == "master", new_active)
        if data.username is not None and data.username.strip() != u.username:
            try:
                name = accounts.check_username(data.username)
            except AccountError as e:
                raise HTTPException(422, str(e))
            if accounts.username_taken(db, name, exclude_id=u.id):
                raise HTTPException(422, f"Esiste già un account «{name}» (anche con maiuscole diverse).")
            changes.append(f"nome utente {u.username} → {name}")
            u.username = name
        if data.display_name is not None:
            name = _line(data.display_name)[:100]
            if not name:
                raise HTTPException(422, "Il nome visibile non può essere vuoto.")
            if name != u.display_name:
                changes.append(f"nome visibile «{name}»")
                u.display_name = name
        revoke = False
        if new_role != u.role:
            changes.append(f"ruolo {ROLE_LABEL[u.role]} → {ROLE_LABEL[new_role]}")
            u.role, revoke = new_role, True
        if new_active != bool(u.active):
            changes.append("riattivato" if new_active else "disattivato")
            u.active = new_active
            revoke = revoke or not new_active
        if revoke:
            accounts.revoke_all(u)  # l'interfaccia del vecchio ruolo non resta aperta da nessuna parte
        if changes:
            accounts.log(db, me, "modifica", u.username, "; ".join(changes))
        db.commit()
    return _out(u, me, _chars_of(db, u.id))


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, me: User = Depends(require_master), db: Session = Depends(get_db)):
    u = _user(db, user_id)
    if u.id == me.id:
        raise HTTPException(409, "La tua password la cambi da «Il mio account».")
    temp = accounts.temporary_password()
    accounts.set_password(u, temp, must_change=True)
    accounts.log(db, me, "password", u.username, "password provvisoria, sessioni chiuse")
    db.commit()
    return {"user": _out(u, me, _chars_of(db, u.id)), "temporary_password": temp}


@router.post("/users/{user_id}/logout-all", status_code=204)
def logout_user(user_id: int, me: User = Depends(require_master), db: Session = Depends(get_db)):
    u = _user(db, user_id)
    accounts.revoke_all(u)
    accounts.log(db, me, "disconnetti", u.username, "tutti i dispositivi")
    db.commit()


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, me: User = Depends(require_master), db: Session = Depends(get_db)):
    with accounts.LOCK:
        u = _user(db, user_id)
        if u.id == me.id:
            raise HTTPException(409, "Non puoi eliminare il tuo account.")
        _guard_last_master(db, u, False, False)
        used = [label for label, model, col in (
            ("personaggi", Character, Character.owner_id), ("tiri", Roll, Roll.author_id),
            ("pagine di diario", JournalEntry, JournalEntry.author_id), ("richieste", Ticket, Ticket.author_id))
            if db.scalar(select(func.count()).select_from(model).where(col == u.id))]
        if used:
            raise HTTPException(409, f"L'account ha già {', '.join(used)}: disattivalo invece di eliminarlo "
                                     "(i personaggi si possono prima assegnare a un altro giocatore).")
        accounts.log(db, me, "elimina", u.username, ROLE_LABEL.get(u.role, u.role))
        db.delete(u)
        db.commit()


@router.patch("/characters/{char_id}/owner")
def assign_character(char_id: int, data: OwnerIn, me: User = Depends(require_master), db: Session = Depends(get_db)):
    c = db.get(Character, char_id)
    if c is None:
        raise HTTPException(404, "Personaggio non trovato.")
    new = db.get(User, data.owner_id)
    if new is None:
        raise HTTPException(404, "Account non trovato.")
    if not new.active:
        raise HTTPException(409, "Non puoi assegnare un personaggio a un account disattivato.")
    if c.owner_id != new.id:
        old = c.owner.username if c.owner else "?"
        c.owner_id = new.id
        accounts.log(db, me, "assegna", new.username, f"{c.name} (da {old})")
        db.commit()
        db.refresh(c)
    return {"id": c.id, "name": c.name, "owner_id": c.owner_id, "owner_name": new.display_name}


@router.get("/log")
def admin_log(limit: int = Query(50, ge=1, le=200), _: User = Depends(require_master), db: Session = Depends(get_db)):
    rows = db.scalars(select(AdminLog).order_by(AdminLog.id.desc()).limit(limit))
    return [{"id": r.id, "at": r.at, "actor": r.actor, "action": r.action, "target": r.target, "detail": r.detail}
            for r in rows]
