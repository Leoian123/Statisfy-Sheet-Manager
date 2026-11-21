import os
import secrets
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Vecchia chiave di sviluppo pubblicata nel codice: chi la conosce può firmare un token da Master.
_PUBLIC_SECRETS = {"statisfy-dev-secret-cambiami"}
MIN_SECRET_LEN = 32


def load_secret() -> str:
    """Chiave di firma dei JWT.
    - `STATISFY_SECRET` se impostata (almeno 32 caratteri, mai la vecchia chiave pubblica);
    - altrimenti una chiave casuale generata al primo avvio e salvata in `STATISFY_SECRET_FILE`
      (default `backend/.secret_key`, esclusa da git), così resta stabile tra i riavvii."""
    env = os.environ.get("STATISFY_SECRET")
    if env is not None:
        if env in _PUBLIC_SECRETS or len(env) < MIN_SECRET_LEN:
            raise RuntimeError(f"STATISFY_SECRET non sicura: serve una chiave casuale di almeno {MIN_SECRET_LEN} "
                               "caratteri (es. python -c \"import secrets; print(secrets.token_urlsafe(48))\").")
        return env
    path = Path(os.environ.get("STATISFY_SECRET_FILE") or BACKEND_DIR / ".secret_key")
    try:
        saved = path.read_text(encoding="utf-8").strip()
        if len(saved) >= MIN_SECRET_LEN and saved not in _PUBLIC_SECRETS:
            return saved
    except FileNotFoundError:
        pass
    key = secrets.token_urlsafe(48)
    path.write_text(key, encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return key


SECRET = load_secret()
DATABASE_URL = os.environ.get("STATISFY_DB_URL", f"sqlite:///{(BACKEND_DIR / 'statisfy.db').as_posix()}")
TOKEN_HOURS = 12
BCRYPT_ROUNDS = int(os.environ.get("STATISFY_BCRYPT_ROUNDS", "12"))
# Ambiente: "production" spegne /docs e /openapi.json e aggiunge HSTS; altrimenti sviluppo
ENV = os.environ.get("STATISFY_ENV", "development").strip().lower()
PRODUCTION = ENV == "production"
# Origini ammesse dal browser (CORS), separate da virgola. In produzione il frontend è servito dallo stesso
# processo (stessa origine): di default nessuna origine esterna.
_cors = os.environ.get("STATISFY_CORS_ORIGINS")
CORS_ORIGINS = ([o.strip() for o in _cors.split(",") if o.strip() and o.strip() != "*"] if _cors is not None
                else [] if PRODUCTION else ["http://localhost:5174", "http://127.0.0.1:5174"])
# Frontend compilato da servire (npm --prefix frontend run build); vuota = non servirlo
_dist = os.environ.get("STATISFY_FRONTEND_DIST")
FRONTEND_DIST = (Path(_dist) if _dist else BACKEND_DIR.parent / "frontend" / "dist") if _dist != "" else None
# Limiti delle richieste (anti-abuso, proporzionati a un'app tra amici)
MAX_JSON_BYTES = 1024 * 1024            # corpo JSON
MAX_UPLOAD_BYTES = 6 * 1024 * 1024      # multipart (import Excel: 5 MB + margine)
LOGIN_MAX_FAILS = 10                    # tentativi falliti per utente e IP...
LOGIN_WINDOW_S = 10 * 60                # ...in questa finestra, poi 429
# Diario e richieste al Master
JOURNAL_MAX_ENTRIES = 1000              # pagine di diario per utente
TICKET_MAX_ACTIVE = 20                  # richieste non chiuse per utente
TICKET_MAX_MESSAGES = 100               # messaggi per richiesta
# Giorni tra la chiusura di una richiesta (risolta, respinta, ritirata) e l'archiviazione automatica (0 = subito)
TICKET_ARCHIVE_DAYS = max(0, min(3650, int(os.environ.get("STATISFY_TICKET_ARCHIVE_DAYS", "7"))))
TICKET_MAX_PER_DAY = 30                 # richieste create per utente nelle ultime 24 ore
