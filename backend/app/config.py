import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

SECRET = os.environ.get("STATISFY_SECRET", "statisfy-dev-secret-cambiami")
DATABASE_URL = os.environ.get("STATISFY_DB_URL", f"sqlite:///{(BACKEND_DIR / 'statisfy.db').as_posix()}")
TOKEN_HOURS = 12
BCRYPT_ROUNDS = int(os.environ.get("STATISFY_BCRYPT_ROUNDS", "12"))
CORS_ORIGINS = ["http://localhost:5174", "http://127.0.0.1:5174"]
