from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config

# timeout: quanto una scrittura aspetta il lock di SQLite prima di «database is locked» (default 5 s)
engine = create_engine(config.DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 15})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Colonne aggiunte dopo la prima versione dello schema: create_all non altera le tabelle esistenti, quindi i DB
# già creati le ricevono qui. Solo DDL costante, nessun dato dell'utente.
_ADDED_COLUMNS = [
    ("characters", "version", "ALTER TABLE characters ADD COLUMN version INTEGER NOT NULL DEFAULT 1"),
    ("forge_entries", "version", "ALTER TABLE forge_entries ADD COLUMN version INTEGER NOT NULL DEFAULT 1"),
    # tiro d100: dichiarazione sopra/sotto e critico (righe vecchie: NULL)
    ("rolls", "call", "ALTER TABLE rolls ADD COLUMN call VARCHAR(10)"),
    ("rolls", "crit", "ALTER TABLE rolls ADD COLUMN crit VARCHAR(15)"),
    # revoca dei token (esci da tutti i dispositivi, cambio password)
    ("users", "token_version", "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"),
    # amministrazione degli account
    ("users", "active", "ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1"),
    ("users", "must_change_password", "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT 0"),
    ("users", "created_at", "ALTER TABLE users ADD COLUMN created_at VARCHAR(40) NOT NULL DEFAULT ''"),
    ("users", "last_login_at", "ALTER TABLE users ADD COLUMN last_login_at VARCHAR(40) NOT NULL DEFAULT ''"),
]


def ensure_columns(bind) -> list[str]:
    """Aggiunge le colonne mancanti alle tabelle esistenti. Ritorna «tabella.colonna» aggiunte."""
    insp = inspect(bind)
    tables = set(insp.get_table_names())
    todo = [(t, c, ddl) for t, c, ddl in _ADDED_COLUMNS
            if t in tables and c not in {x["name"] for x in insp.get_columns(t)}]
    if todo:
        with bind.begin() as conn:
            for _, _, ddl in todo:
                conn.execute(text(ddl))
    return [f"{t}.{c}" for t, c, _ in todo]
