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
CORS_ORIGINS = ["http://localhost:5174", "http://127.0.0.1:5174"]
# Limiti delle richieste (anti-abuso, proporzionati a un'app tra amici)
MAX_JSON_BYTES = 1024 * 1024            # corpo JSON
MAX_UPLOAD_BYTES = 6 * 1024 * 1024      # multipart (import Excel: 5 MB + margine)
LOGIN_MAX_FAILS = 10                    # tentativi falliti per utente e IP...
LOGIN_WINDOW_S = 10 * 60                # ...in questa finestra, poi 429
