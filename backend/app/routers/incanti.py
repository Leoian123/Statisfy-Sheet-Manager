"""Richieste di incantesimo: il giocatore compone un incantesimo (o un miracolo, per il chierico) con lo stesso wizard
della Forgia e lo manda al Master dentro una richiesta (kind "incanto"); il Master lo rivede, lo approva o lo respinge.

- Il giocatore usa meta e anteprima ristrette: vede solo i suoi PG, non può assegnare né forzare.
- La bozza sta in `Ticket.meta` = {forge_kind, draft, card, note, entry_id}; `card` è il riepilogo calcolato all'invio.
- Il giocatore corregge la bozza finché la richiesta è attiva: torna «aperta» e nel filo resta un messaggio.
- «Approva» (Master): la bozza (eventualmente ritoccata dal Master) passa dalla Forgia come un salvataggio normale:
  voce nella libreria e skill attiva del PG (Grado I · 1%), poi la richiesta si chiude «risolta».
- Si respinge con lo stato «respinta» e la risposta (PATCH /api/tickets/{id})."""
import copy
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .. import config, forge, rules
from ..auth import current_user, require_master
from ..db import get_db
from ..models import Character, Ticket, User
from . import forge as forge_router
from .journal import _clean_text
from .tickets import ACTIVE, _CREATE_LOCK, _chars, _editable, _get, _iso, _names, _now, _out, check_limits

# Montato dentro il router delle richieste (fondo di tickets.py): /api/tickets/incanti/...
router = APIRouter(prefix="/incanti", tags=["incanti"])

MagicKind = Literal["spells", "miracles"]
KIND_NAME = {"spells": "Incantesimo", "miracles": "Miracolo"}
# Campi che decide solo il Master: il giocatore non assegna e non forza
_MASTER_ONLY = ("assign", "force")


class IncantoIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: MagicKind
    draft: dict[str, Any] = Field(default_factory=dict)
    note: str = Field("", max_length=2000)


class IncantoEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int | None = None
    draft: dict[str, Any] = Field(default_factory=dict)
    note: str | None = Field(None, max_length=2000)


class PreviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: MagicKind
    draft: dict[str, Any] = Field(default_factory=dict)


class ApproveIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int | None = None
    draft: dict[str, Any] | None = None  # bozza ritoccata dal Master; None = quella del giocatore
    force: bool = False                    # assegna anche se mancano sfere, Fede o favore
    risposta: str = Field("", max_length=5000)


# ---------- Contesto ristretto al giocatore ----------
def _own_chars(db: Session, user: User) -> list[Character]:
    q = select(Character).order_by(Character.id)
    if user.role != "master":
        q = q.where(Character.owner_id == user.id)
    return list(db.scalars(q).unique())


def _ctx(db: Session, chars: list[Character]) -> dict:
    """Come il contesto della Forgia, ma con i soli PG indicati (il giocatore non vede le schede degli altri)."""
    lib: dict[str, list] = {k: [] for k in forge.KINDS}
    for e in forge_router._entries(db):
        if e.kind in ("spells", "miracles"):
            lib[e.kind].append(e.data or {})
    return {"chars": [forge_router._char_ctx(c) for c in chars], "library": lib}


def _player_draft(draft: dict, char_id: Any) -> dict:
    d = copy.deepcopy(draft)
    for k in _MASTER_ONLY:
        d.pop(k, None)
    d["assign"], d["force"] = False, False
    d["charId"] = str(char_id) if char_id not in (None, "") else ""
    return d


def _char_of(db: Session, user: User, draft: dict) -> Character:
    raw = draft.get("charId")
    try:
        cid = int(raw)
    except (TypeError, ValueError):
        raise HTTPException(422, "Scegli il personaggio che imparerà l'incantesimo.") from None
    c = db.get(Character, cid)
    if c is None or (user.role != "master" and c.owner_id != user.id):
        raise HTTPException(404, "Personaggio non trovato.")
    return c


def _has_skill(c: Character, name: str) -> bool:
    n = name.strip().lower()
    return any(str(x.get("name") or "").strip().lower() == n for x in (c.active_skills or []) if isinstance(x, dict))


def _card(kind: str, draft: dict, ctx: dict) -> tuple[dict, list[str]]:
    """Riepilogo per la richiesta (nome, sintesi, effetto, meccanica, requisiti non soddisfatti) o gli errori dei passi."""
    entry, err = forge.build(kind, draft, ctx)
    if entry is None:
        return {}, [err or "Bozza non valida."]
    comp = forge.WIZARDS[kind]["compute"](draft, ctx)
    if kind == "spells":
        issues = [f"Non possiede {r['s']} Grado {rules.ROMAN[r['need']]}" for r in comp.get("reqs") or [] if r.get("status") == "missing"]
        if comp.get("reqs") and any(r.get("status") == "overcast" for r in comp["reqs"]):
            issues.append("Sotto il Grado consigliato: il lancio conta come overcast")
        if not comp.get("can_skill"):
            issues.append("Improvvisato: non diventa una skill")
    else:
        issues = [forge.cap(i) for i in comp.get("issues") or []]
    mech = comp.get("mech") or {}
    return {"name": entry["name"], "type": KIND_NAME[kind], "summary": entry.get("summary", ""), "effect": entry.get("effect", ""),
            "mech_text": mech.get("text", ""), "issues": issues}, []


def _body(card: dict, note: str) -> str:
    parts = [card["effect"]]
    if note:
        parts.append(f"Note per il Master: {note}")
    return "\n\n".join(p for p in parts if p)[:5000]


def _title(card: dict) -> str:
    return f"{card['type']}: {card['name']}"[:120]


# ---------- Giocatore ----------
@router.get("/meta")
def meta(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Opzioni dei wizard Incantesimo e Miracolo: costanti delle regole e i soli PG di chi chiede."""
    m = forge_router.meta(db)
    chars = _own_chars(db, user)
    return {**m,
            "kinds": [k for k in m["kinds"] if k["key"] in ("spells", "miracles")],
            "steps": {k: v for k, v in m["steps"].items() if k in ("spells", "miracles")},
            "characters": [{"id": c.id, "name": c.name, "level": c.level, "classe": c.classe,
                            "exp_pct": rules.clean(rules.num(c.exp_pct)), "cleric": rules.is_cleric(c.classe)} for c in chars],
            "library_skills": [], "known_titles": [], "races": [], "classes": [], "assignable": []}


@router.post("/preview")
def preview(data: PreviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Validazione per passo e numeri della bozza, come nella Forgia, sui soli PG di chi chiede."""
    chars = _own_chars(db, user)
    d = _player_draft(data.draft, data.draft.get("charId"))
    if d["charId"] and not any(str(c.id) == d["charId"] for c in chars):
        d["charId"] = ""
    return forge.preview(data.kind, d, _ctx(db, chars))


def _prepare(db: Session, user: User, kind: str, draft: dict) -> tuple[dict, Character, dict]:
    c = _char_of(db, user, draft)
    d = _player_draft(draft, c.id)
    card, errs = _card(kind, d, _ctx(db, [c]))
    if errs:
        raise HTTPException(422, errs[0])
    if _has_skill(c, card["name"]):
        raise HTTPException(409, f"{c.name} ha già «{card['name']}» tra le skill attive: scegli un altro nome.")
    return d, c, card


@router.post("", status_code=201)
def create(data: IncantoIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Invia la bozza al Master come richiesta di incantesimo."""
    with _CREATE_LOCK:
        check_limits(db, user)
        d, c, card = _prepare(db, user, data.kind, data.draft)
        now = _iso(_now())
        t = Ticket(author_id=user.id, char_id=c.id, kind="incanto", title=_title(card),
                   body=_body(card, _clean_text(data.note).strip()), status="aperta", answer="", messages=[],
                   seen_by_author=True, created_at=now, updated_at=now,
                   meta={"forge_kind": data.kind, "draft": d, "card": card, "note": _clean_text(data.note).strip(), "entry_id": None})
        db.add(t)
        db.commit()
        return _out(t, _names(db), _chars(db), user)


def _incanto(db: Session, user: User, ticket_id: int) -> Ticket:
    t = _get(db, user, ticket_id)
    if t.kind != "incanto" or not isinstance(t.meta, dict):
        raise HTTPException(422, "Questa richiesta non è un incantesimo.")
    _editable(t)
    return t


@router.put("/{ticket_id}")
def update(ticket_id: int, data: IncantoEdit, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Il giocatore corregge la bozza finché la richiesta è attiva: torna tra quelle da guardare del Master."""
    t = _incanto(db, user, ticket_id)
    if t.author_id != user.id:
        raise HTTPException(403, "Solo chi ha composto l'incantesimo lo modifica.")
    if data.version is not None and data.version != t.version:
        raise HTTPException(409, "La richiesta è cambiata in un'altra sessione: ricarica e riprova.")
    if t.status not in ACTIVE:
        raise HTTPException(409, "La richiesta è chiusa: componi un nuovo incantesimo.")
    kind = t.meta.get("forge_kind")
    d, c, card = _prepare(db, user, kind, data.draft)
    note = _clean_text(data.note).strip() if data.note is not None else None
    note = (t.meta.get("note") or "") if note is None else note
    now = _iso(_now())
    t.title, t.body, t.char_id = _title(card), _body(card, note), c.id
    t.meta = {**t.meta, "draft": d, "card": card, "note": note}
    flag_modified(t, "meta")
    msgs = list(t.messages or [])
    if len(msgs) < config.TICKET_MAX_MESSAGES:
        msgs.append({"by": user.id, "by_name": user.display_name, "role": user.role, "text": "Ho aggiornato l'incantesimo.", "at": now})
        t.messages = msgs
        flag_modified(t, "messages")
    t.status = "aperta"
    t.updated_at = now
    db.commit()
    return _out(t, _names(db), _chars(db), user)


# ---------- Master ----------
@router.post("/{ticket_id}/approva", dependencies=[Depends(require_master)])
def approve(ticket_id: int, data: ApproveIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Approva: salva nella libreria della Forgia e aggiunge la skill attiva al PG; chiude la richiesta «risolta»."""
    t = _incanto(db, user, ticket_id)
    if data.version is not None and data.version != t.version:
        raise HTTPException(409, "La richiesta è cambiata in un'altra sessione: ricarica e riprova.")
    if t.status not in ACTIVE:
        raise HTTPException(409, "La richiesta è già chiusa.")
    c = db.get(Character, t.char_id) if t.char_id is not None else None
    if c is None:
        raise HTTPException(404, "Il personaggio della richiesta non esiste più.")
    kind = t.meta.get("forge_kind")
    d = copy.deepcopy(data.draft if data.draft is not None else t.meta.get("draft") or {})
    d.update({"charId": str(c.id), "assign": True, "force": bool(data.force)})
    name = forge.txt(d.get("name"))
    if _has_skill(c, name):
        raise HTTPException(409, f"{c.name} ha già «{name}» tra le skill attive.")
    res = forge_router.create_entry(forge_router.DraftIn(kind=kind, draft=d), db)  # salva e assegna (commit)
    entry = res["entry"]
    db.refresh(t)
    learned = entry.get("assigned_to") == c.id
    text = _clean_text(data.risposta).strip() or (
        f"Approvato: «{entry['name']}» è nel grimorio di {c.name} (Grado I · 1%)." if learned
        else f"Approvato: «{entry['name']}» è nella libreria della campagna.")
    now = _iso(_now())
    card, _ = _card(kind, {**d, "assign": False, "force": False}, _ctx(db, [c]))  # i valori approvati, non la proposta
    t.meta = {**t.meta, "draft": d, "entry_id": entry["id"], "learned": learned, **({"card": card} if card else {})}
    flag_modified(t, "meta")
    t.answer, t.status, t.closed_at, t.updated_at = text, "risolta", now, now
    t.seen_by_author = False
    db.commit()
    return {"ticket": _out(t, _names(db), _chars(db), user), "messages": res["messages"]}
