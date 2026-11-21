from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

import time

from sqlalchemy import delete

from ..auth import (burn_password_check, create_token, current_user, login_limiter, token_claims, user_out,
                    verify_password)
from .. import accounts
from ..db import get_db
from ..models import RevokedToken, User
from ..schemas import LoginIn

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    username = data.username.strip()
    ip = request.client.host if request.client else "?"
    wait = login_limiter.retry_after(ip, username)
    if wait:
        raise HTTPException(429, f"Troppi tentativi falliti: riprova tra {(wait + 59) // 60} minuti.",
                            headers={"Retry-After": str(wait)})
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        burn_password_check(data.password)  # stesso tempo di una password sbagliata
    if user is None or not verify_password(data.password, user.password_hash):
        login_limiter.failed(ip, username)
        raise HTTPException(401, "Nome utente o password errati.")
    if not user.active:  # solo dopo la password giusta: chi non la conosce non scopre lo stato dell'account
        raise HTTPException(403, "Account disattivato: chiedi al Master.")
    login_limiter.succeeded(ip, username)
    user.last_login_at = accounts.now_iso()
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.post("/logout", status_code=204)
def logout(user: User = Depends(current_user), claims: dict = Depends(token_claims), db: Session = Depends(get_db)):
    """Esci: questo token smette di valere subito (gli altri dispositivi restano connessi)."""
    now = int(time.time())
    db.execute(delete(RevokedToken).where(RevokedToken.exp < now))
    jti, exp = claims.get("jti"), int(claims.get("exp") or now)
    if jti and db.get(RevokedToken, str(jti)) is None:
        db.add(RevokedToken(jti=str(jti), exp=exp))
    db.commit()


@router.post("/logout-all", status_code=204)
def logout_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Esci da tutti i dispositivi: tutti i token emessi finora per questo utente smettono di valere."""
    user.token_version = (user.token_version or 0) + 1
    db.commit()


class PasswordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(max_length=256)
    new_password: str = Field(max_length=256)


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str = Field(min_length=1, max_length=100)


@router.post("/password")
def change_password(data: PasswordIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Cambio password dell'utente (anche la provvisoria data dal Master). Gli altri dispositivi vengono disconnessi;
    questo riceve un token nuovo. Chi ha rubato un token non può indovinare la password: vale il limite del login."""
    ip = request.client.host if request.client else "?"
    wait = login_limiter.retry_after(ip, user.username)
    if wait:
        raise HTTPException(429, f"Troppi tentativi falliti: riprova tra {(wait + 59) // 60} minuti.",
                            headers={"Retry-After": str(wait)})
    if not verify_password(data.current_password, user.password_hash):
        login_limiter.failed(ip, user.username)
        raise HTTPException(422, "La password attuale non è corretta.")
    if data.new_password == data.current_password:
        raise HTTPException(422, "La nuova password deve essere diversa da quella attuale.")
    try:
        accounts.set_password(user, data.new_password)
    except accounts.AccountError as e:
        raise HTTPException(422, str(e))
    login_limiter.succeeded(ip, user.username)
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


@router.patch("/me")
def update_profile(data: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Nome visibile agli altri (il nome utente per il login lo cambia solo il Master)."""
    from .journal import _clean_text
    name = " ".join(_clean_text(data.display_name).split())
    if not name:
        raise HTTPException(422, "Il nome visibile non può essere vuoto.")
    user.display_name = name[:100]
    db.commit()
    return user_out(user)
