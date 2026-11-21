import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import secrets

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import RevokedToken, User

bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


_dummy_hash: str | None = None


def burn_password_check(pw: str) -> None:
    """Per un utente inesistente esegue comunque un bcrypt con lo stesso costo: i tempi di risposta non
    rivelano quali nomi utente esistono."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_hex(16))
    verify_password(pw, _dummy_hash)


# ---------- Limite ai tentativi di login falliti (in memoria: basta per un solo processo uvicorn) ----------
LOGIN_MAX_FAILS = config.LOGIN_MAX_FAILS


class LoginLimiter:
    """Al più `max_fails` login falliti per (IP, utente) in `window` secondi; poi 429 fino allo scadere della
    finestra. Un login riuscito azzera il conteggio. Un tetto per IP (5×) frena chi prova molti nomi."""

    def __init__(self, max_fails: int, window: float):
        self.max_fails, self.window = max_fails, window
        self._fails: dict[tuple, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _recent(self, key: tuple, now: float) -> deque:
        q = self._fails[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if not q:
            self._fails.pop(key, None)
        return q

    def retry_after(self, ip: str, username: str) -> int:
        """Secondi di attesa se bloccato, altrimenti 0."""
        now = time.monotonic()
        with self._lock:
            waits = []
            for key, limit in (((ip, username.lower()), self.max_fails), ((ip, None), self.max_fails * 5)):
                q = self._recent(key, now)
                if len(q) >= limit:
                    waits.append(int(self.window - (now - q[0])) + 1)
            return max(waits, default=0)

    def failed(self, ip: str, username: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._fails[(ip, username.lower())].append(now)
            self._fails[(ip, None)].append(now)

    def succeeded(self, ip: str, username: str) -> None:
        with self._lock:
            self._fails.pop((ip, username.lower()), None)

    def reset(self) -> None:
        with self._lock:
            self._fails.clear()


login_limiter = LoginLimiter(config.LOGIN_MAX_FAILS, config.LOGIN_WINDOW_S)


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "role": user.role, "iat": now, "exp": now + timedelta(hours=config.TOKEN_HOURS),
               "jti": secrets.token_urlsafe(16), "tv": user.token_version or 0}
    return jwt.encode(payload, config.SECRET, algorithm="HS256")


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role,
            "must_change_password": bool(u.must_change_password)}


# Con una password provvisoria si può solo leggere il proprio profilo, cambiarla o uscire
_ALLOWED_BEFORE_CHANGE = {"/api/auth/me", "/api/auth/password", "/api/auth/logout", "/api/auth/logout-all"}


def current_user(request: Request, cred: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    if cred is None or cred.scheme.lower() != "bearer":
        raise HTTPException(401, "Accesso richiesto.", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(cred.credentials, config.SECRET, algorithms=["HS256"])
        uid = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "Sessione non valida o scaduta: accedi di nuovo.", headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, uid)
    if user is None:
        raise HTTPException(401, "Utente non trovato.", headers={"WWW-Authenticate": "Bearer"})
    # Revoca: «Esci» (jti nella lista) o «Esci da tutti i dispositivi»/cambio password (token_version cambiata)
    jti = payload.get("jti")
    if payload.get("tv", 0) != (user.token_version or 0) or (jti and db.get(RevokedToken, str(jti)) is not None):
        raise HTTPException(401, "Sessione chiusa: accedi di nuovo.", headers={"WWW-Authenticate": "Bearer"})
    if not user.active:
        raise HTTPException(401, "Account disattivato: chiedi al Master.", headers={"WWW-Authenticate": "Bearer"})
    if user.must_change_password and request.url.path not in _ALLOWED_BEFORE_CHANGE:
        raise HTTPException(403, "Prima di continuare scegli una nuova password.")
    return user


def token_claims(cred: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    """Claim del token già validato da current_user (serve a «Esci» per revocarlo)."""
    try:
        return jwt.decode(cred.credentials, config.SECRET, algorithms=["HS256"]) if cred else {}
    except jwt.PyJWTError:
        return {}


def require_master(user: User = Depends(current_user)) -> User:
    if user.role != "master":
        raise HTTPException(403, "Operazione riservata al Master.")
    return user
