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
from .web import SecurityHeaders, frontend_dist, page_csp, spa_handler
from .routers import (admin, auth, characters, combat, equipment, forge, imports, journal, master, rules, scontri, table,
                      tickets)
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        seed_if_empty(db)
        tickets.rotate(db)  # archivia le richieste chiuse da più dei giorni di conservazione
    yield


_docs = {} if not config.PRODUCTION else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title="STATISFY Sheet Manager API", version="1.0", lifespan=lifespan, **_docs)
_dist = frontend_dist()
app.add_middleware(BodyGuard)  # dimensione dei corpi e numeri non finiti (aggiunto prima: CORS resta il più esterno)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"])
# header di sicurezza: il più esterno, così vale anche per le risposte di errore di CORS e BodyGuard
app.add_middleware(SecurityHeaders, page_policy=page_csp((_dist / "index.html").read_text(encoding="utf-8")) if _dist else None)


@app.get("/api/health", include_in_schema=False)
def health():
    """Per il monitoraggio: nessun dato, nessun login."""
    return {"status": "ok"}


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": message(exc.errors())})


@app.exception_handler(StaleDataError)
async def stale_handler(request: Request, exc: StaleDataError):
    """Blocco ottimistico: un'altra sessione ha salvato lo stesso PG (o voce della Forgia) nel frattempo."""
    return JSONResponse(status_code=409, content={
        "detail": "Questi dati sono stati modificati da un'altra sessione nello stesso momento: ricarica e riprova."})


@app.exception_handler(IntegrityError)
async def integrity_handler(request: Request, exc: IntegrityError):
    """Vincolo violato da due richieste contemporanee (es. due PG con lo stesso nome creati insieme)."""
    return JSONResponse(status_code=409, content={"detail": "Conflitto con dati già salvati: ricarica e riprova."})


@app.exception_handler(OverflowError)
async def overflow_handler(request: Request, exc: OverflowError):
    """Interi oltre i 64 bit di SQLite (es. id 2**70 nel percorso): richiesta non valida, non errore del server."""
    return JSONResponse(status_code=422, content={"detail": "Dati non validi — numero fuori intervallo."})


for r in (auth.router, rules.router, characters.router, combat.router, equipment.router, master.router, imports.router,
          forge.router, table.router, journal.router, tickets.router, admin.router, scontri.router):
    app.include_router(r)


# Frontend compilato (produzione): dopo le API, così /api/... non finisce mai sulla SPA
if _dist is not None:
    app.add_api_route("/{path:path}", spa_handler(_dist), methods=["GET", "HEAD"], include_in_schema=False)
