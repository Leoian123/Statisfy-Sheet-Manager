# STATISFY Sheet Manager

Gestionale di schede personaggio per il GDR STATISFY.

| Cartella | Contenuto |
|---|---|
| `backend/` | API FastAPI + SQLite. Tutte le regole (formule, creazione, level up, combattimento, morte) sono in `backend/app/rules.py` |
| `frontend/` | App React + Vite + TypeScript |
| `backend/png/` | Preset dei PNG (YAML da ritoccare a mano): vedi `backend/png/LEGGIMI.md` |
| `docs/API.md` | Contratto API fra frontend e backend |
| `mockup/` | Prototipo di design approvato (riferimento visivo) |
| `statisfy/` | Regolamento del gioco |

## Primo avvio

Backend (Windows, dalla cartella del progetto):

```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
```

Frontend:

```bash
npm --prefix frontend install
```

## Avvio in sviluppo

Due terminali:

```bash
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
```

```bash
npm --prefix frontend run dev
```

Poi apri http://localhost:5174. Al primo avvio il backend crea `backend/statisfy.db` con i dati di esempio.

## Utenti di sviluppo

| Utente | Password | Ruolo |
|---|---|---|
| master | master | Master: vede tutte le schede, PNG, quest e questioni |
| giocatore1 … giocatore6 | uguale al nome utente | Giocatore: vede solo i propri PG (giocatore1 ha Kelvin) |

Sono solo per lo sviluppo locale.

## Altri comandi

- Test backend: `backend/.venv/Scripts/python -m pytest -q` (da `backend/`)
- Rilascio in produzione: `docs/DEPLOY.md`
- Test frontend (logica pura, test runner di Node 22, nessuna dipendenza in più): `npm --prefix frontend test`
- Frontend contro un backend su un'altra porta: variabile `STATISFY_API` (es. `http://127.0.0.1:8011`) prima di `npm --prefix frontend run dev`
- Ricreare il database con i dati di esempio: `backend/.venv/Scripts/python -m app.seed --reset` (da `backend/`)
- Frontend con backend finto in memoria: `npm --prefix frontend run dev:mock`
- Mockup: `python mockup/serve.py`
- Controllo dei preset dei PNG e prove sui PNG già scritti: `backend/.venv/Scripts/python -m app.png controlla` (da `backend/`)
