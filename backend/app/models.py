from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    display_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10))
    # Cresce a ogni «Esci da tutti i dispositivi» e cambio password: i token con un valore diverso non valgono più
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Amministrazione: account disattivati (niente login), password provvisoria da cambiare, date (ISO, "" se ignote)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, default="", server_default="")
    last_login_at: Mapped[str] = mapped_column(String(40), nullable=False, default="", server_default="")


class AdminLog(Base):
    """Registro delle operazioni di amministrazione (chi ha fatto cosa a quale account). Tenute le ultime 1.000."""
    __tablename__ = "admin_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    at: Mapped[str] = mapped_column(String(40))
    actor: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(40))
    target: Mapped[str] = mapped_column(String(100))
    detail: Mapped[str] = mapped_column(String(300), default="")


class RevokedToken(Base):
    """Token usciti con «Esci» prima della scadenza (jti). Le righe scadute si cancellano a ogni nuova uscita."""
    __tablename__ = "revoked_tokens"
    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    exp: Mapped[int] = mapped_column(Integer, index=True)  # secondi epoch


class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    session: Mapped[int] = mapped_column(Integer, default=1)
    master_name: Mapped[str] = mapped_column(String(100))
    open_quests: Mapped[list[Any]] = mapped_column(JSON, default=list)


class Character(Base):
    __tablename__ = "characters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    owner: Mapped[User] = relationship(lazy="joined")
    name: Mapped[str] = mapped_column(String(50))
    name_key: Mapped[str] = mapped_column(String(50), unique=True, index=True)  # nome minuscolo, per l'unicità
    classe: Mapped[str] = mapped_column(String(100))
    level: Mapped[int] = mapped_column(Integer, default=1)
    exp_pct: Mapped[float] = mapped_column(default=0)
    regno: Mapped[str] = mapped_column(String(100))
    pvp: Mapped[str] = mapped_column(String(10), default="Bianco")
    corone: Mapped[int] = mapped_column(Integer, default=0)
    scellini: Mapped[int] = mapped_column(Integer, default=0)
    gilda: Mapped[dict] = mapped_column(JSON, default=dict)
    profile: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=dict)  # razza, età, aspetto, alleanze…
    stats: Mapped[list] = mapped_column(JSON, default=list)
    item_bonus: Mapped[dict] = mapped_column(JSON, default=dict)
    equip: Mapped[dict] = mapped_column(JSON, default=dict)
    magia: Mapped[dict] = mapped_column(JSON, default=dict)
    resources: Mapped[dict] = mapped_column(JSON, default=dict)
    titles: Mapped[list] = mapped_column(JSON, default=list)
    skills: Mapped[list] = mapped_column(JSON, default=list)
    active_skills: Mapped[list] = mapped_column(JSON, default=list)
    talents: Mapped[list] = mapped_column(JSON, default=list)
    inventory: Mapped[list] = mapped_column(JSON, default=list)
    pets: Mapped[list] = mapped_column(JSON, default=list)
    curses: Mapped[list] = mapped_column(JSON, default=list)
    quests: Mapped[list] = mapped_column(JSON, default=list)
    reputation: Mapped[list] = mapped_column(JSON, default=list)
    combat: Mapped[dict] = mapped_column(JSON, default=dict)
    death: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    # Blocco ottimistico: ogni UPDATE richiede la versione letta, così due sessioni contemporanee non si
    # sovrascrivono in silenzio (la seconda riceve 409 e ricarica). Vedi main.py e db.ensure_columns.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}


class Npc(Base):
    __tablename__ = "npcs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    level: Mapped[int] = mapped_column(Integer, default=1)
    race: Mapped[str] = mapped_column(String(100), default="")
    place: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(200), default="")
    trust: Mapped[str] = mapped_column(String(20), default="Neutrale")
    knows: Mapped[str] = mapped_column(Text, default="")
    debts: Mapped[str] = mapped_column(Text, default="")
    last: Mapped[str] = mapped_column(Text, default="")
    secret: Mapped[str] = mapped_column(Text, default="")
    history: Mapped[list] = mapped_column(JSON, default=list)


class Issue(Base):
    __tablename__ = "issues"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    sev: Mapped[str] = mapped_column(String(10))
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    decision: Mapped[str | None] = mapped_column(Text, nullable=True)


class ForgeEntry(Base):
    """Voce della libreria della campagna creata con la Forgia del Master (skill, classe, razza, titolo, PNG,
    incontro, incantesimo, miracolo). `data` = voce completa del wizard; `closed` = chiusura di un incontro."""
    __tablename__ = "forge_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(100))
    summary: Mapped[str] = mapped_column(Text, default="")
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    assigned_to: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)  # id del PG, senza FK
    npc_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    closed: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    session: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String(40), default="")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}


class Scontro(Base):
    """Scontro in corso sulla plancia: stato completo del motore (`engine.py`) — ordine dei turni, combattenti,
    status, effetti in attesa, registro. Uno solo attivo alla volta. `history` = ultimi stati per «Annulla»
    (non inviati al client). Le risorse dei PG restano sincronizzate con `Character.resources`."""
    __tablename__ = "scontri"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    encounter_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)  # ForgeEntry, senza FK
    state: Mapped[dict] = mapped_column(JSON, default=dict)
    history: Mapped[list] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[str] = mapped_column(String(40), default="")
    closed_at: Mapped[str | None] = mapped_column(String(40), nullable=True, default=None)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}


class Roll(Base):
    """Tiro d100 al tavolo (plancia). Il risultato lo genera il server: tens/units dai d10, natural 1–100
    (00 + 0 = 100), total = natural + somma dei `mods` allegati.
    `call` = dichiarazione prima del tiro, `crit` = critico calcolato dal server sul naturale (vedi `table.crit_of`). `char_id` None = tiro del Master (anche segreto)."""
    __tablename__ = "rolls"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    char_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True, default=None)  # id del PG, senza FK
    author_id: Mapped[int] = mapped_column(Integer)  # utente che ha tirato
    reason: Mapped[str] = mapped_column(String(120), default="")
    tens: Mapped[int] = mapped_column(Integer)
    units: Mapped[int] = mapped_column(Integer)
    natural: Mapped[int] = mapped_column(Integer)
    mods: Mapped[list] = mapped_column(JSON, default=list)  # [{kind, name, mod, text}]
    total: Mapped[int] = mapped_column(Integer)
    call: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None)  # "sopra" | "sotto" dichiarato prima
    crit: Mapped[str | None] = mapped_column(String(15), nullable=True, default=None)  # None | "critico" | "supercritico"
    secret: Mapped[bool] = mapped_column(Boolean, default=False)
    request_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    created_at: Mapped[str] = mapped_column(String(40), default="")


class RollRequest(Base):
    """Richiesta di tiro del Master a un PG: `aperta` finché il giocatore non risponde con un tiro (`risolta`, `roll_id`)."""
    __tablename__ = "roll_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    char_id: Mapped[int] = mapped_column(Integer, index=True)
    what: Mapped[str] = mapped_column(String(80))
    note: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(10), default="aperta")
    roll_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    created_at: Mapped[str] = mapped_column(String(40), default="")


class JournalEntry(Base):
    """Pagina del diario dell'avventuriero: appunti di un utente, legati facoltativamente a un suo PG.
    `visibility` = "privato" (solo l'autore) o "gruppo" (tutti i giocatori e il Master).
    `attachments` = istantanee di tiri, oggetti, titoli, skill, talenti e quest al momento dell'allegato:
    [{kind, ref, label, detail, rarity}] (restano leggibili anche se l'elemento poi cambia o sparisce)."""
    __tablename__ = "journal_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    author_id: Mapped[int] = mapped_column(Integer, index=True)
    char_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True, default=None)  # id del PG, senza FK
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    attachments: Mapped[list] = mapped_column(JSON, default=list)
    visibility: Mapped[str] = mapped_column(String(10), default="privato")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    session: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String(40), default="")
    updated_at: Mapped[str] = mapped_column(String(40), default="")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}


class Ticket(Base):
    """Richiesta di un giocatore al Master: proposta di funzione, di contenuto o domanda sul regolamento.
    Stati: aperta → in_esame → risolta | respinta (oppure ritirata dall'autore). Chiusa (`closed_at`), dopo
    `config.TICKET_ARCHIVE_DAYS` giorni va in archivio (`archived_at`) e da lì è solo leggibile."""
    __tablename__ = "tickets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    author_id: Mapped[int] = mapped_column(Integer, index=True)
    char_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    kind: Mapped[str] = mapped_column(String(12))
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="aperta", index=True)
    answer: Mapped[str] = mapped_column(Text, default="")
    messages: Mapped[list] = mapped_column(JSON, default=list)  # [{by, by_name, role, text, at}]
    issue_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)  # questione delle regole creata
    seen_by_author: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(String(40), default="")
    updated_at: Mapped[str] = mapped_column(String(40), default="")
    closed_at: Mapped[str | None] = mapped_column(String(40), nullable=True, default=None)
    archived_at: Mapped[str | None] = mapped_column(String(40), nullable=True, default=None, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}
