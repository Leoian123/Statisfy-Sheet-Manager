"""Evoluzione delle skill a cicli di 10 Gradi.

Quando una skill (o skill attiva, incantesimo, miracolo) arriva al Grado X si aprono due richieste collegate:
  - «evoluzione» per il Master: definire la passiva (e, se vuole, nuova meccanica della skill stessa);
  - «comunicazione» per il giocatore: proporre liberamente l'evoluzione. I suoi messaggi arrivano anche al Master.
Con «Definisci evoluzione» il Master aggiunge la passiva alle skill del PG; la skill completa il ciclo
(`cicli` + 1, `evoluzioni` registra la passiva) e riparte dal Grado I. Livello totale = cicli × 10 + Grado
(es. Dardo: 3 cicli + Grado IV = 34; passive X, XX, XXX).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from . import mech as MECH
from .models import Character, Ticket, User

FIELDS = ("skills", "active_skills")
FIELD_LABEL = {"skills": "skill", "active_skills": "skill attiva"}
MAX_CYCLES = 99


def roman(n: int) -> str:
    vals = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
            (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    out = ""
    for v, s in vals:
        while n >= v:
            out += s
            n -= v
    return out or "—"


def cycles(sk: dict) -> int:
    try:
        return max(0, int(sk.get("cicli") or 0))
    except (TypeError, ValueError):
        return 0


def total_level(sk: dict) -> int:
    return cycles(sk) * 10 + int(sk.get("lvl") or 0)


def kind_label(sk: dict, field: str) -> str:
    k = sk.get("kind")
    return {"Incantesimo": "incantesimo", "Miracolo": "miracolo"}.get(k, FIELD_LABEL[field])


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _key(meta: dict) -> tuple:
    return (meta.get("field"), str(meta.get("skill", "")).lower(), int(meta.get("ciclo") or 0))


def open_requests(db: Session, c: Character, master: User, before: dict[str, list] | None = None,
                  only: tuple[str, str] | None = None) -> list[Ticket]:
    """Apre la coppia di richieste per le skill del PG arrivate al Grado X (senza un'evoluzione già aperta).
    `before` = liste prima del salvataggio: conta solo chi passa al Grado X adesso (non chi c'era già o è appena
    stato importato). `only` = (campo, nome) per aprirla a mano su una skill già al Grado X."""
    existing = {_key(t.meta or {}) for t in db.scalars(select(Ticket).where(Ticket.char_id == c.id,
                                                                           Ticket.kind == "evoluzione"))}
    created = []
    ts = now()
    for field in FIELDS:
        prev = {str(x.get("name", "")).strip().lower(): x for x in (before or {}).get(field) or []}
        for sk in getattr(c, field) or []:
            if int(sk.get("lvl") or 0) != 10 or cycles(sk) >= MAX_CYCLES:
                continue
            name = str(sk.get("name") or "").strip()
            if only is not None:
                if (field, name.lower()) != (only[0], only[1].strip().lower()):
                    continue
            else:
                old = prev.get(name.lower())
                if old is None or int(old.get("lvl") or 0) == 10 and cycles(old) == cycles(sk):
                    continue  # già al Grado X prima di questo salvataggio, oppure skill nuova
            ciclo = cycles(sk) + 1
            meta = {"field": field, "skill": name, "ciclo": ciclo}
            if not name or _key(meta) in existing:
                continue
            tag = roman(10 * ciclo)
            what = kind_label(sk, field)
            m = Ticket(author_id=master.id, recipient_id=None, char_id=c.id, kind="evoluzione",
                       title=f"Evoluzione: {name} {tag} ({c.name})"[:120],
                       body=(f"{c.name} ha portato {what} «{name}» al Grado X (ciclo {ciclo}, livello {10 * ciclo}).\n"
                             f"Definisci la passiva «{name} {tag}». La proposta del giocatore arriva qui tra i messaggi.\n"
                             "Puoi anche dare alla skill nuove caratteristiche della Forgia (meccanica)."),
                       status="aperta", answer="", messages=[], seen_by_author=True, seen_by_recipient=True,
                       meta={**meta, "role": "master"}, created_at=ts, updated_at=ts)
            p = Ticket(author_id=master.id, recipient_id=c.owner_id, char_id=c.id, kind="comunicazione",
                       title=f"{name} al Grado X: proponi l'evoluzione"[:120],
                       body=(f"«{name}» di {c.name} ha raggiunto il Grado X: completa il ciclo {ciclo} e ottiene una "
                             f"passiva nuova («{name} {tag}»), poi riparte dal Grado I.\n"
                             "Rispondi con un messaggio descrivendo l'evoluzione che vorresti: il Master la definirà."),
                       status="aperta", answer="", messages=[], seen_by_author=True, seen_by_recipient=False,
                       meta={**meta, "role": "giocatore"}, created_at=ts, updated_at=ts)
            db.add_all([m, p])
            db.flush()
            m.meta = {**m.meta, "pair": p.id}
            p.meta = {**p.meta, "pair": m.id}
            existing.add(_key(meta))
            created += [m, p]
    return created


def pair_of(db: Session, t: Ticket) -> Ticket | None:
    pid = (t.meta or {}).get("pair")
    return db.get(Ticket, int(pid)) if pid else None


def find_skill(c: Character, field: str, name: str) -> dict | None:
    return next((x for x in getattr(c, field) or [] if str(x.get("name", "")).strip().lower() == name.lower()), None)


def complete(db: Session, t: Ticket, data: Any) -> tuple[Character, str]:
    """Applica l'evoluzione definita dal Master. `data`: EvolveIn (passiva_nome, passiva_effetto, passiva_mech,
    skill_mech, togli_meccanica, risposta). Restituisce il PG modificato e il testo della risposta."""
    meta = t.meta or {}
    c = db.get(Character, t.char_id) if t.char_id else None
    if c is None:
        raise ValueError("Il personaggio di questa evoluzione non esiste più.")
    field, name, ciclo = meta.get("field"), str(meta.get("skill") or ""), int(meta.get("ciclo") or 1)
    lst = [dict(x) for x in getattr(c, field) or []]
    sk = next((x for x in lst if str(x.get("name", "")).strip().lower() == name.lower()), None)
    if sk is None:
        raise ValueError(f"«{name}» non è più tra le skill di {c.name}.")
    if cycles(sk) >= ciclo:
        raise ValueError(f"«{name}» ha già completato il ciclo {ciclo}.")
    pname = (data.passiva_nome or f"{name} {roman(10 * ciclo)}").strip()[:120]
    skills = [dict(x) for x in c.skills or []]
    if field == "skills":
        skills = lst
    if any(str(x.get("name", "")).strip().lower() == pname.lower() for x in skills):
        raise ValueError(f"{c.name} ha già una skill chiamata «{pname}».")
    pmech = None
    if data.passiva_mech:
        m, errs = MECH.parse({**data.passiva_mech, "tipo": data.passiva_mech.get("tipo") or "passiva"})
        if errs:
            raise ValueError("Meccanica della passiva: " + "; ".join(errs[:3]))
        pmech = MECH.dump(m)
    if data.skill_mech:
        m, errs = MECH.parse(data.skill_mech)
        if errs:
            raise ValueError(f"Meccanica di «{name}»: " + "; ".join(errs[:3]))
        sk["mech"] = MECH.dump(m)
    elif data.togli_meccanica:
        sk.pop("mech", None)
    passive = {"name": pname, "lvl": 10, "pct": "MAX", "type": f"Evoluzione · {name}",
               "passive": (data.passiva_effetto or "").strip()[:2000] or None, "origine": name, "ciclo": ciclo}
    if pmech:
        passive["mech"] = pmech
    evo = list(sk.get("evoluzioni") or [])
    evo.append({"ciclo": ciclo, "passiva": pname, "at": now()})
    sk.update({"cicli": ciclo, "lvl": 1, "pct": 0, "evoluzioni": evo})
    skills.append(passive)
    if field == "active_skills":
        c.active_skills = lst
        flag_modified(c, "active_skills")
    c.skills = skills
    flag_modified(c, "skills")
    text = (data.risposta or "").strip() or (
        f"«{name}» completa il ciclo {ciclo}: nuova passiva «{pname}»"
        + (f" — {passive['passive'].rstrip('.')}" if passive["passive"] else "") + ". La skill riparte dal Grado I.")
    return c, text
