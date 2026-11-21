"""Regole degli account condivise da API di amministrazione, cambio password e riga di comando (app.users).

- Nome utente: 3–30 caratteri tra lettere, cifre, punto, trattino e trattino basso; unico senza distinguere
  maiuscole e minuscole (il login le distingue: «Luca» e «luca» sarebbero due persone indistinguibili a vista).
- Password: 8–72 byte (bcrypt ignora quello che viene dopo il 72° byte), diversa dal nome utente.
- Un nuovo account parte con `token_version` casuale: SQLite può riassegnare l'id di un account eliminato e un token
  rimasto in giro per il vecchio account non deve valere per il nuovo.
- Deve restare sempre almeno un Master attivo."""
import re
import secrets
import threading
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .auth import hash_password
from .models import AdminLog, User

PASSWORD_MIN = 8
PASSWORD_MAX_BYTES = 72
USERNAME_RE = re.compile(r"[A-Za-z0-9._-]{3,30}")
ROLES = ("master", "player")
LOG_KEEP = 1000

# Controllo «ultimo Master» + modifica atomici tra richieste contemporanee (un solo worker, vedi docs/DEPLOY.md)
LOCK = threading.Lock()


class AccountError(ValueError):
    """Dato non valido: il messaggio è per l'utente."""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def check_username(name: str) -> str:
    name = (name or "").strip()
    if not USERNAME_RE.fullmatch(name):
        raise AccountError("Nome utente: da 3 a 30 caratteri tra lettere, cifre, punto, trattino e trattino basso.")
    return name


def check_password(pw: str, username: str = "") -> str:
    if len(pw) < PASSWORD_MIN:
        raise AccountError(f"La password deve avere almeno {PASSWORD_MIN} caratteri.")
    if len(pw.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise AccountError(f"La password può avere al massimo {PASSWORD_MAX_BYTES} byte (circa 70 caratteri).")
    if not pw.strip():
        raise AccountError("La password non può essere fatta solo di spazi.")
    if username and pw.strip().lower() == username.strip().lower():
        raise AccountError("La password non può essere uguale al nome utente.")
    return pw


def temporary_password() -> str:
    """Password provvisoria leggibile (gruppi di 4, senza caratteri ambigui), ~60 bit."""
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(12))
    return "-".join(raw[i:i + 4] for i in range(0, 12, 4))


def username_taken(db: Session, name: str, exclude_id: int | None = None) -> User | None:
    q = select(User).where(func.lower(User.username) == name.lower())
    if exclude_id is not None:
        q = q.where(User.id != exclude_id)
    return db.scalar(q)


def create(db: Session, username: str, password: str, role: str, display_name: str = "",
           must_change: bool = False) -> User:
    name = check_username(username)
    if role not in ROLES:
        raise AccountError("Ruolo non valido.")
    if username_taken(db, name):
        raise AccountError(f"Esiste già un account «{name}» (anche con maiuscole diverse).")
    check_password(password, name)
    user = User(username=name, password_hash=hash_password(password), display_name=(display_name or name)[:100],
                role=role, active=True, must_change_password=must_change, created_at=now_iso(),
                token_version=secrets.randbelow(2 ** 31))
    db.add(user)
    db.flush()
    return user


def set_password(user: User, password: str, must_change: bool = False) -> None:
    check_password(password, user.username)
    user.password_hash = hash_password(password)
    user.must_change_password = must_change
    revoke_all(user)


def revoke_all(user: User) -> None:
    """Tutti i token già emessi per l'utente smettono di valere."""
    user.token_version = (user.token_version or 0) + 1


def other_active_masters(db: Session, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(User).where(
        User.role == "master", User.active.is_(True), User.id != user_id)) or 0


def log(db: Session, actor: User | None, action: str, target: str, detail: str = "") -> None:
    db.add(AdminLog(at=now_iso(), actor=actor.username if actor else "riga di comando", action=action,
                    target=target[:100], detail=detail[:300]))
    db.flush()
    cutoff = db.scalar(select(AdminLog.id).order_by(AdminLog.id.desc()).offset(LOG_KEEP).limit(1))
    if cutoff is not None:
        db.execute(delete(AdminLog).where(AdminLog.id <= cutoff))
