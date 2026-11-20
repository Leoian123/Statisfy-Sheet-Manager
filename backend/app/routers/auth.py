from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import burn_password_check, create_token, current_user, login_limiter, user_out, verify_password
from ..db import get_db
from ..models import User
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
