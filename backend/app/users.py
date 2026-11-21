"""Gestione utenti da riga di comando.

Uso (dalla cartella backend):
  .venv\\Scripts\\python -m app.users create NOME [--role master|player] [--display "Nome visibile"]
  .venv\\Scripts\\python -m app.users passwd NOME
  .venv\\Scripts\\python -m app.users list

La password si inserisce a terminale (input nascosto) e viene salvata solo come hash bcrypt.
"""
import argparse
import getpass
import sys

from sqlalchemy import func, select

from .auth import hash_password
from .db import Base, SessionLocal, engine
from .models import User

MIN_PASSWORD = 6


def ask_password() -> str:
    while True:
        pw = getpass.getpass("Password: ")
        if len(pw) < MIN_PASSWORD:
            print(f"La password deve avere almeno {MIN_PASSWORD} caratteri.")
            continue
        if getpass.getpass("Ripeti la password: ") != pw:
            print("Le password non coincidono, riprova.")
            continue
        return pw


def cmd_create(args) -> int:
    name = args.username.strip()
    if not name or len(name) > 50:
        print("Nome utente non valido (1–50 caratteri).")
        return 1
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == name)):
            print(f"L'utente '{name}' esiste già.")
            return 1
        similar = db.scalar(select(User).where(func.lower(User.username) == name.lower()))
        if similar:
            print(f"Nota: esiste già '{similar.username}'. Il login distingue maiuscole e minuscole.")
        pw = ask_password()
        user = User(username=name, password_hash=hash_password(pw), display_name=args.display or name, role=args.role)
        db.add(user)
        db.commit()
        print(f"Creato utente '{name}' (ruolo {args.role}, id {user.id}).")
    return 0


def cmd_passwd(args) -> int:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == args.username))
        if not user:
            print(f"Utente '{args.username}' non trovato.")
            return 1
        user.password_hash = hash_password(ask_password())
        user.token_version = (user.token_version or 0) + 1  # i login fatti con la vecchia password non valgono più
        db.commit()
        print(f"Password di '{user.username}' aggiornata.")
    return 0


def cmd_list(_args) -> int:
    with SessionLocal() as db:
        for u in db.scalars(select(User).order_by(User.id)):
            print(f"{u.id:>3}  {u.username:<20} {u.role:<7} {u.display_name}")
    return 0


def main(argv=None) -> int:
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
    ls = sub.add_parser("list", help="elenca gli utenti")
    ls.set_defaults(func=cmd_list)
    args = p.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
