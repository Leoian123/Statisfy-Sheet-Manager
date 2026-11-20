from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from . import config
from .db import SessionLocal
from .errors import message
from .guard import BodyGuard
from .routers import auth, characters, combat, equipment, forge, imports, master, rules, table
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        seed_if_empty(db)
    yield


app = FastAPI(title="STATISFY Sheet Manager API", version="1.0", lifespan=lifespan)
app.add_middleware(BodyGuard)  # dimensione dei corpi e numeri non finiti (aggiunto prima: CORS resta il più esterno)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": message(exc.errors())})


@app.exception_handler(StaleDataError)
async def stale_handler(request: Request, exc: StaleDataError):
    """Blocco ottimistico: un'altra sessione ha salvato lo stesso PG (o voce della Forgia) nel frattempo."""
    return JSONResponse(status_code=409, content={
        "detail": "Il personaggio è stato modificato da un'altra sessione nello stesso momento: ricarica e riprova."})


@app.exception_handler(IntegrityError)
async def integrity_handler(request: Request, exc: IntegrityError):
    """Vincolo violato da due richieste contemporanee (es. due PG con lo stesso nome creati insieme)."""
    return JSONResponse(status_code=409, content={"detail": "Conflitto con dati già salvati: ricarica e riprova."})


@app.exception_handler(OverflowError)
async def overflow_handler(request: Request, exc: OverflowError):
    """Interi oltre i 64 bit di SQLite (es. id 2**70 nel percorso): richiesta non valida, non errore del server."""
    return JSONResponse(status_code=422, content={"detail": "Dati non validi — numero fuori intervallo."})


for r in (auth.router, rules.router, characters.router, combat.router, equipment.router, master.router, imports.router,
          forge.router, table.router):
    app.include_router(r)
