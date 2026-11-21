"""Gestione utenti da riga di comando.

Uso (dalla cartella backend):
  .venv\\Scripts\\python -m app.users create NOME [--role master|player] [--display "Nome visibile"]
  .venv\\Scripts\\python -m app.users passwd NOME
  .venv\\Scripts\\python -m app.users activate NOME   (riattiva un account disattivato)
  .venv\\Scripts\\python -m app.users list

La password si inserisce a terminale (input nascosto) e viene salvata solo come hash bcrypt.
"""
import argparse
import getpass
import sys

from sqlalchemy import select

from . import accounts
from .db import Base, SessionLocal, engine, ensure_columns
from .models import User

MIN_PASSWORD = accounts.PASSWORD_MIN


def ask_password(username: str = "") -> str:
    while True:
        pw = getpass.getpass("Password: ")
        try:
            accounts.check_password(pw, username)
        except accounts.AccountError as e:
            print(e)
            continue
        if getpass.getpass("Ripeti la password: ") != pw:
            print("Le password non coincidono, riprova.")
            continue
        return pw


def cmd_create(args) -> int:
    try:
        name = accounts.check_username(args.username)
    except accounts.AccountError as e:
        print(e)
        return 1
    with SessionLocal() as db:
        if accounts.username_taken(db, name):
            print(f"Esiste già un account '{name}' (anche con maiuscole diverse).")
            return 1
        pw = ask_password(name)
        user = accounts.create(db, name, pw, args.role, args.display or name)
        accounts.log(db, None, "crea", user.username, f"ruolo {args.role}")
        db.commit()
        print(f"Creato utente '{name}' (ruolo {args.role}, id {user.id}).")
    return 0


def cmd_passwd(args) -> int:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == args.username))
        if not user:
            print(f"Utente '{args.username}' non trovato.")
            return 1
        accounts.set_password(user, ask_password(user.username))  # i login con la vecchia password non valgono più
        accounts.log(db, None, "password", user.username, "cambiata da riga di comando")
        db.commit()
        print(f"Password di '{user.username}' aggiornata.")
    return 0


def cmd_activate(args) -> int:
    """Recupero: riattiva un account (es. l'unico Master disattivato per errore)."""
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == args.username))
        if not user:
            print(f"Utente '{args.username}' non trovato.")
            return 1
        user.active = True
        accounts.log(db, None, "modifica", user.username, "riattivato da riga di comando")
        db.commit()
        print(f"Account '{user.username}' attivo.")
    return 0


def cmd_list(_args) -> int:
    with SessionLocal() as db:
        for u in db.scalars(select(User).order_by(User.id)):
            state = "" if u.active else "  (disattivato)"
            print(f"{u.id:>3}  {u.username:<20} {u.role:<7} {u.display_name}{state}")
    return 0


def main(argv=None) -> int:
    ensure_columns(engine)  # DB creato da una versione precedente
    Base.metadata.create_all(engine)
    p = argparse.ArgumentParser(prog="python -m app.users", description="Gestione utenti STATISFY")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create", help="crea un utente")
    c.add_argument("username")
    c.add_argument("--role", choices=["master", "player"], default="player")
    c.add_argument("--display", help="nome visibile (default: username)")
    c.set_defaults(func=cmd_create)
    pw = sub.add_parser("passwd", help="cambia la password di un utente")
    pw.add_argument("username")
    pw.set_defaults(func=cmd_passwd)
    ac = sub.add_parser("activate", help="riattiva un account disattivato")
    ac.add_argument("username")
    ac.set_defaults(func=cmd_activate)
    ls = sub.add_parser("list", help="elenca gli utenti")
    ls.set_defaults(func=cmd_list)
    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
