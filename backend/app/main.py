from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .db import SessionLocal
from .errors import message
from .routers import auth, characters, combat, equipment, forge, imports, master, rules, table
from .seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        seed_if_empty(db)
    yield


app = FastAPI(title="STATISFY Sheet Manager API", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": message(exc.errors())})


for r in (auth.router, rules.router, characters.router, combat.router, equipment.router, master.router, imports.router,
          forge.router, table.router):
    app.include_router(r)
