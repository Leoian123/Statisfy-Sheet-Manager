from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

import time

from sqlalchemy import delete

from ..auth import (burn_password_check, create_token, current_user, login_limiter, token_claims, user_out,
                    verify_password)
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
    login_limiter.succeeded(ip, username)
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
