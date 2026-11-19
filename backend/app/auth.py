from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "role": user.role, "iat": now, "exp": now + timedelta(hours=config.TOKEN_HOURS)}
    return jwt.encode(payload, config.SECRET, algorithm="HS256")


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role}


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
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
    return user


def require_master(user: User = Depends(current_user)) -> User:
    if user.role != "master":
        raise HTTPException(403, "Operazione riservata al Master.")
    return user
