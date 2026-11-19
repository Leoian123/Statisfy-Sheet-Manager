# STATISFY Sheet Manager — backend

API FastAPI che implementa il contratto in `../docs/API.md`. Le regole (formule, creazione, level up,
combattimento, morte) sono in `app/rules.py` (funzioni pure, porting di `mockup/rules.js`).

## Setup
```
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

## Avvio (dalla cartella `backend`)
```
.venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload
```
Al primo avvio crea `statisfy.db` (SQLite) e lo popola con i dati di seed se è vuoto.
Per ricreare il DB da zero: `.venv\Scripts\python -m app.seed --reset`.

Variabili d'ambiente (facoltative):
- `STATISFY_SECRET` — segreto JWT (default di sviluppo: cambiarlo in produzione)
- `STATISFY_DB_URL` — URL SQLAlchemy del DB (default `sqlite:///backend/statisfy.db`)

Documentazione interattiva: http://127.0.0.1:8000/docs

## Test
```
.venv\Scripts\python -m pytest -q
```
Ogni test usa un DB SQLite temporaneo ricreato dal seed.

## Utenti di sviluppo (solo seed)
| username | password | ruolo |
|---|---|---|
| master | master | master (Il Narratore) |
| giocatore1 … giocatore6 | uguale allo username | player (Giocatore 1 … 6) |

PG: Kelvin → giocatore1, Eric → 2, Corax → 3, Deniel → 4, Connor → 5, Dante → 6.
