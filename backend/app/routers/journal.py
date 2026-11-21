"""Diario dell'avventuriero: appunti in stile blog dei giocatori, con allegati (tiri, oggetti, titoli, skill,
talenti, quest) salvati come istantanee.

Visibilità: "privato" = solo l'autore (nemmeno il Master); "gruppo" = tutti gli utenti della campagna.
Solo l'autore modifica; il Master può eliminare le pagine "gruppo" (moderazione), mai leggere quelle private.
Gli allegati li risolve il server: il client manda solo {kind, ref} e non può inventare etichette o tiri altrui."""
import threading
import unicodedata
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import String, and_, case, cast, func, or_, select, true
from sqlalchemy.orm import Session

from .. import config
from ..auth import current_user
from ..db import get_db
from ..models import Campaign, Character, JournalEntry, Roll, User

router = APIRouter(prefix="/api/journal", tags=["journal"])

Visibility = Literal["privato", "gruppo"]
AttachKind = Literal["roll", "item", "title", "skill", "talent", "quest"]
MAX_ATTACH = 12
MAX_TAGS = 8
TAG_MAX = 24


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


_KEEP_FORMAT = {"\u200d"}  # zero-width joiner: serve alle emoji composte


def _clean_text(s: str) -> str:
    """Normalizza gli a capo e toglie: caratteri di controllo (C0/C1, tranne a capo e tab), surrogati isolati e
    caratteri di formato invisibili (override bidi come U+202E, zero-width U+200B, BOM…)."""
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    out = []
    for ch in s:
        if ch in "\n\t":
            out.append(ch)
            continue
        cat = unicodedata.category(ch)
        if cat in ("Cc", "Cs") or (cat == "Cf" and ch not in _KEEP_FORMAT):
            continue
        out.append(ch)
    return "".join(out)


class AttachIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: AttachKind
    ref: str = Field(min_length=1, max_length=120)


class EntryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    body: str = Field("", max_length=20000)
    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)
    char_id: int | None = None
    visibility: Visibility = "privato"
    pinned: bool = False
    attachments: list[AttachIn] = Field(default_factory=list, max_length=MAX_ATTACH)

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for t in v:
            t = " ".join(_clean_text(str(t)).split()).lower()[:TAG_MAX].strip()
            if t and t not in out:
                out.append(t)
        return out


class EntryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int | None = None  # versione letta: se nel frattempo è cambiata → 409
    title: str | None = Field(None, min_length=1, max_length=120)
    body: str | None = Field(None, max_length=20000)
    tags: list[str] | None = Field(None, max_length=MAX_TAGS)
    char_id: int | None = None
    visibility: Visibility | None = None
    pinned: bool | None = None
    attachments: list[AttachIn] | None = Field(None, max_length=MAX_ATTACH)

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else EntryIn._tags(v)


def _session(db: Session) -> int:
    c = db.scalar(select(Campaign).order_by(Campaign.id))
    return c.session if c else 1


def _char_for(db: Session, user: User, char_id: int | None) -> Character | None:
    """PG a cui legare la pagina: deve essere dell'utente (il Master può usarne uno qualsiasi)."""
    if char_id is None:
        return None
    c = db.get(Character, char_id)
    if c is None or (user.role != "master" and c.owner_id != user.id):
        raise HTTPException(404, "Personaggio non trovato.")
    return c


def _find(lst: list | None, name: str) -> dict | None:
    key = name.strip().lower()
    return next((x for x in lst or [] if isinstance(x, dict) and str(x.get("name", "")).strip().lower() == key), None)


def _short(s: object, n: int = 300) -> str:
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[: n - 1] + "…"


def _resolve(db: Session, user: User, char: Character | None, a: AttachIn, visibility: str) -> dict:
    """Istantanea di un allegato, verificata sul server."""
    if a.kind == "roll":
        try:
            rid = int(a.ref)
        except ValueError:
            raise HTTPException(422, "Tiro allegato non valido.")
        r = db.get(Roll, rid) if 0 < rid < 2 ** 62 else None
        if r is None:
            raise HTTPException(422, f"Tiro {a.ref} non trovato.")
        if user.role != "master":
            owner = db.get(Character, r.char_id) if r.char_id is not None else None
            if r.secret or owner is None or owner.owner_id != user.id:
                raise HTTPException(422, f"Tiro {a.ref} non trovato.")
        if r.secret and visibility != "privato":
            raise HTTPException(422, "Un tiro segreto si allega solo a una pagina privata.")
        rc = db.get(Character, r.char_id) if r.char_id is not None else None
        who = rc.name if rc else "Master"
        mods = sum(int(m.get("mod") or 0) for m in r.mods or [] if isinstance(m, dict))
        detail = f"{who}: d100 {r.natural}" + (f" {'+' if mods >= 0 else '−'}{abs(mods)} = {r.total}" if mods else "")
        if r.call:
            detail += f" · {r.call}"
        if r.crit:
            detail += f" · {r.crit}"
        return {"kind": "roll", "ref": str(r.id), "label": _short(r.reason or "Tiro libero", 120), "detail": _short(detail),
                "rarity": None, "at": r.created_at}
    if a.kind == "quest":
        found = _find(char.quests if char else None, a.ref)
        if found is None:
            found = _find(_campaign_quests(db, user), a.ref)
        if found is None:
            raise HTTPException(422, f"Quest «{_short(a.ref, 60)}» non trovata.")
        detail = " · ".join(str(found[k]) for k in ("progress", "reward", "who", "due") if found.get(k))
        return {"kind": "quest", "ref": found["name"], "label": _short(found["name"], 120), "detail": _short(detail),
                "rarity": found.get("rarity")}
    if char is None:
        raise HTTPException(422, "Per allegare oggetti, titoli, skill o talenti scegli il personaggio della pagina.")
    field = {"item": "inventory", "title": "titles", "talent": "talents"}.get(a.kind)
    if a.kind == "skill":
        found = _find(char.skills, a.ref) or _find(char.active_skills, a.ref)
    else:
        found = _find(getattr(char, field), a.ref)
    if found is None:
        raise HTTPException(422, f"«{_short(a.ref, 60)}» non è nella scheda di {char.name}.")
    if a.kind == "title":
        detail = ", ".join(f"{k} {'+' if v >= 0 else ''}{v}" for k, v in (found.get("bonus") or {}).items()
                           if isinstance(v, (int, float))) or found.get("effect") or "Effetto narrativo"
    elif a.kind == "item":
        detail = " · ".join(str(x) for x in (found.get("type"), found.get("stats_text")) if x)
    elif a.kind == "skill":
        detail = " · ".join(str(x) for x in (f"Grado {found.get('lvl')}" if found.get("lvl") else "", found.get("type"),
                                              found.get("effect") or found.get("passive")) if x)
    else:
        detail = " · ".join(str(x) for x in (found.get("origin"), found.get("effect")) if x)
    return {"kind": a.kind, "ref": found["name"], "label": _short(found["name"], 120), "detail": _short(detail),
            "rarity": found.get("rarity")}


def _attachments(db: Session, user: User, char: Character | None, items: list[AttachIn], visibility: str) -> list[dict]:
    out, seen = [], set()
    for a in items:
        snap = _resolve(db, user, char, a, visibility)
        key = (snap["kind"], snap["ref"].lower())
        if key not in seen:
            seen.add(key)
            out.append(snap)
    return out


_CREATE_LOCK = threading.Lock()  # conteggio + inserimento atomici (un solo worker, vedi docs/DEPLOY.md)


def _like(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _campaign_quests(db: Session, user: User) -> list[dict]:
    """Quest della campagna visibili: il Master le vede tutte, il giocatore solo quelle dei suoi PG (campo `who`)."""
    camp = db.scalar(select(Campaign).order_by(Campaign.id))
    quests = [x for x in (camp.open_quests if camp else []) or [] if isinstance(x, dict) and x.get("name")]
    if user.role == "master":
        return quests
    mine = [n.lower() for n in db.scalars(select(Character.name).where(Character.owner_id == user.id))]
    return [x for x in quests if any(n in str(x.get("who", "")).lower() for n in mine)]


def _visible(user: User):
    return or_(JournalEntry.author_id == user.id, JournalEntry.visibility == "gruppo")


def _entry_out(e: JournalEntry, names: dict[int, str], chars: dict[int, str], user: User) -> dict:
    return {"id": e.id, "author_id": e.author_id, "author_name": names.get(e.author_id, "—"), "mine": e.author_id == user.id,
            "char_id": e.char_id, "char_name": chars.get(e.char_id) if e.char_id else None,
            "title": e.title, "body": e.body, "tags": e.tags or [], "attachments": e.attachments or [],
            "visibility": e.visibility, "pinned": bool(e.pinned), "session": e.session,
            "created_at": e.created_at, "updated_at": e.updated_at, "version": e.version}


def _maps(db: Session) -> tuple[dict[int, str], dict[int, str]]:
    names = {u.id: u.display_name for u in db.scalars(select(User))}
    chars = {c.id: c.name for c in db.scalars(select(Character))}
    return names, chars


def _get(db: Session, user: User, entry_id: int) -> JournalEntry:
    e = db.get(JournalEntry, entry_id)
    if e is None or (e.author_id != user.id and e.visibility != "gruppo"):
        raise HTTPException(404, "Pagina non trovata.")
    return e


@router.get("")
def list_entries(scope: Literal["tutto", "miei", "gruppo"] = "tutto", char_id: int | None = None,
                 tag: str | None = Query(None, max_length=TAG_MAX), q: str | None = Query(None, max_length=100),
                 limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0, le=100000),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Pagine visibili dall'utente, fissate in cima e poi dalla più recente. Filtri: autore, PG, tag, testo."""
    cond = [_visible(user)]
    if scope == "miei":
        cond.append(JournalEntry.author_id == user.id)
    elif scope == "gruppo":
        cond.append(JournalEntry.visibility == "gruppo")
    if char_id is not None:
        cond.append(JournalEntry.char_id == char_id)
    if tag and tag.strip():
        je = func.json_each(JournalEntry.tags).table_valued("value")
        cond.append(select(1).select_from(je).where(je.c.value == tag.strip().lower()).exists())
    if q and q.strip():
        pat = _like(q.strip().lower())
        cond.append(or_(*(func.lower(col).like(pat, escape="\\") for col in
                          (JournalEntry.title, JournalEntry.body, cast(JournalEntry.tags, String),
                           cast(JournalEntry.attachments, String)))))
    # Filtri, conteggio e pagina in SQL: niente righe caricate in memoria oltre la pagina richiesta
    total = db.scalar(select(func.count()).select_from(JournalEntry).where(*cond)) or 0
    # Solo le proprie pagine fissate salgono in cima: quelle degli altri non scavalcano le tue
    own_pin = case((and_(JournalEntry.pinned.is_(True), JournalEntry.author_id == user.id), 1), else_=0)
    rows = db.scalars(select(JournalEntry).where(*cond)
                      .order_by(own_pin.desc(), JournalEntry.created_at.desc(), JournalEntry.id.desc())
                      .limit(limit).offset(offset))
    je = func.json_each(JournalEntry.tags).table_valued("value")
    all_tags = sorted({str(t) for t in db.scalars(select(je.c.value).select_from(JournalEntry).join(je, true())
                                                  .where(_visible(user)).distinct().limit(500)) if t is not None})
    names, chars = _maps(db)
    return {"total": total, "tags": all_tags, "items": [_entry_out(e, names, chars, user) for e in rows]}


@router.get("/attachables")
def attachables(char_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Cosa si può allegare: tiri recenti del PG, oggetti, titoli, skill, talenti, quest del PG e della campagna."""
    char = _char_for(db, user, char_id)
    out: dict[str, list[dict]] = {k: [] for k in ("roll", "item", "title", "skill", "talent", "quest")}
    if char is not None:
        for r in db.scalars(select(Roll).where(Roll.char_id == char.id, Roll.secret.is_(False))
                            .order_by(Roll.id.desc()).limit(30)):
            out["roll"].append({"ref": str(r.id), "label": r.reason or "Tiro libero",
                                "detail": f"d100 {r.natural} → {r.total}" + (f" · {r.crit}" if r.crit else ""), "at": r.created_at})
        out["item"] = [{"ref": x["name"], "label": x["name"], "rarity": x.get("rarity"), "detail": x.get("type") or ""}
                       for x in char.inventory or [] if isinstance(x, dict) and x.get("name")]
        out["title"] = [{"ref": x["name"], "label": x["name"], "rarity": x.get("rarity"), "detail": ""}
                        for x in char.titles or [] if isinstance(x, dict) and x.get("name")]
        out["skill"] = [{"ref": x["name"], "label": x["name"], "rarity": None, "detail": f"Grado {x.get('lvl', '—')}"}
                        for x in [*(char.skills or []), *(char.active_skills or [])] if isinstance(x, dict) and x.get("name")]
        out["talent"] = [{"ref": x["name"], "label": x["name"], "rarity": x.get("rarity"), "detail": x.get("origin") or ""}
                         for x in char.talents or [] if isinstance(x, dict) and x.get("name")]
        out["quest"] = [{"ref": x["name"], "label": x["name"], "rarity": x.get("rarity"), "detail": x.get("progress") or ""}
                        for x in char.quests or [] if isinstance(x, dict) and x.get("name")]
    known = {x["ref"].lower() for x in out["quest"]}
    out["quest"] += [{"ref": x["name"], "label": x["name"], "rarity": x.get("rarity"), "detail": f"Campagna · {x.get('who', '')}"}
                     for x in _campaign_quests(db, user) if x["name"].lower() not in known]
    return out


@router.post("", status_code=201)
def create_entry(data: EntryIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    with _CREATE_LOCK:
        return _create_entry(data, user, db)


def _create_entry(data: EntryIn, user: User, db: Session):
    n = db.scalar(select(func.count()).select_from(JournalEntry).where(JournalEntry.author_id == user.id)) or 0
    if n >= config.JOURNAL_MAX_ENTRIES:
        raise HTTPException(422, f"Hai raggiunto il massimo di {config.JOURNAL_MAX_ENTRIES} pagine: eliminane qualcuna.")
    title = " ".join(_clean_text(data.title).split())
    if not title:
        raise HTTPException(422, "Il titolo è obbligatorio.")
    char = _char_for(db, user, data.char_id)
    now = _now()
    e = JournalEntry(author_id=user.id, char_id=char.id if char else None, title=title, body=_clean_text(data.body).strip(),
                     tags=data.tags, visibility=data.visibility, pinned=data.pinned, session=_session(db),
                     attachments=_attachments(db, user, char, data.attachments, data.visibility),
                     created_at=now, updated_at=now)
    db.add(e)
    db.commit()
    names, chars = _maps(db)
    return _entry_out(e, names, chars, user)


@router.get("/{entry_id}")
def get_entry(entry_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    names, chars = _maps(db)
    return _entry_out(_get(db, user, entry_id), names, chars, user)


@router.patch("/{entry_id}")
def patch_entry(entry_id: int, data: EntryPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    e = _get(db, user, entry_id)
    if e.author_id != user.id:
        raise HTTPException(403, "Solo l'autore modifica la sua pagina.")
    if data.version is not None and data.version != e.version:
        raise HTTPException(409, "La pagina è stata modificata in un'altra sessione: ricarica e riprova.")
    f = data.model_dump(exclude_unset=True)
    if "title" in f and data.title is not None:
        title = " ".join(_clean_text(data.title).split())
        if not title:
            raise HTTPException(422, "Il titolo è obbligatorio.")
        e.title = title
    if "body" in f and data.body is not None:
        e.body = _clean_text(data.body).strip()
    if "tags" in f and data.tags is not None:
        e.tags = data.tags
    if "pinned" in f and data.pinned is not None:
        e.pinned = data.pinned
    if "visibility" in f and data.visibility is not None:
        e.visibility = data.visibility
    if "char_id" in f:
        e.char_id = _char_for(db, user, data.char_id).id if data.char_id is not None else None
    char = db.get(Character, e.char_id) if e.char_id else None
    if "attachments" in f and data.attachments is not None:
        e.attachments = _attachments(db, user, char, data.attachments, e.visibility)
    elif e.visibility != "privato" and any(a.get("kind") == "roll" and _is_secret(db, a) for a in e.attachments or []):
        raise HTTPException(422, "Un tiro segreto si allega solo a una pagina privata.")
    e.updated_at = _now()
    db.commit()
    names, chars = _maps(db)
    return _entry_out(e, names, chars, user)


def _is_secret(db: Session, a: dict) -> bool:
    try:
        r = db.get(Roll, int(a.get("ref")))
    except (TypeError, ValueError):
        return False
    return bool(r and r.secret)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(entry_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    e = _get(db, user, entry_id)
    if e.author_id != user.id and user.role != "master":
        raise HTTPException(403, "Solo l'autore (o il Master per le pagine del gruppo) elimina una pagina.")
    db.delete(e)
    db.commit()
    return Response(status_code=204)
