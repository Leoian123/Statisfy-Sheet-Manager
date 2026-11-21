# Rilascio in produzione

Un solo processo: il backend FastAPI serve le API (`/api/...`) e il frontend compilato (`frontend/dist`).
Davanti serve un proxy HTTPS (Caddy, nginx, Traefik): l'app non gestisce i certificati.

## 1. Preparazione

```bash
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
```

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m pytest -q
```

## 2. Variabili d'ambiente

| Variabile | Produzione | Note |
|---|---|---|
| `STATISFY_ENV` | `production` | Spegne `/docs`, `/redoc`, `/openapi.json`; aggiunge HSTS. |
| `STATISFY_SECRET` | chiave casuale ≥ 32 caratteri | Firma dei login. `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Se manca, viene generata in `STATISFY_SECRET_FILE` (default `backend/.secret_key`). Cambiarla disconnette tutti. |
| `STATISFY_DB_URL` | es. `sqlite:////srv/statisfy/statisfy.db` | Cartella fuori dal codice, con backup. |
| `STATISFY_CORS_ORIGINS` | vuota | Serve solo se il frontend è su un'altra origine; `*` viene ignorato. |
| `STATISFY_FRONTEND_DIST` | default `frontend/dist` | Stringa vuota = non servire il frontend. |
| `STATISFY_TICKET_ARCHIVE_DAYS` | default `7` | Giorni tra la chiusura di una richiesta e l'archivio (0 = subito). |
| `STATISFY_BCRYPT_ROUNDS` | non impostare | Default 12; i test usano 4. |

## 3. Avvio

```bash
cd backend
STATISFY_ENV=production STATISFY_SECRET=... STATISFY_DB_URL=sqlite:////srv/statisfy/statisfy.db \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers
```

- **Un solo worker**: SQLite e il limitatore dei tentativi di login vivono nel processo.
- Con `STATISFY_ENV=production` e il DB vuoto **non** vengono creati dati né utenti di esempio: crea il Master con
  `python -m app.users create <nome> --role master` (password chiesta a terminale) e i giocatori con `--role player`.
  Non copiare in produzione un DB di sviluppo (password = nome utente).
- Healthcheck: `GET /api/health` → `{"status": "ok"}`.

## 4. Proxy HTTPS (esempio Caddy)

```
statisfy.example.it {
  reverse_proxy 127.0.0.1:8000
  request_body { max_size 7MB }
}
```

## 5. Già pronto nell'app

- Header di sicurezza su tutte le risposte (CSP chiusa per le API, CSP stretta per le pagine con gli script inline
  autorizzati per hash, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS in produzione).
- Limiti dei corpi (1 MB JSON, 6 MB import), rifiuto di NaN/Infinity, limite dei tentativi di login.
- Blocco ottimistico su schede, voci della Forgia, pagine del diario e richieste (409 invece di sovrascrivere).
- Richieste al Master chiuse archiviate in automatico (all'avvio e a ogni lettura dell'elenco).

## 6. Backup

SQLite: copia a caldo con `sqlite3 statisfy.db ".backup 'statisfy-$(date +%F).db'"` una volta al giorno, tenendo
almeno 14 copie. Prova il ripristino avviando l'app su una copia con `STATISFY_DB_URL`.

## 7. Sessioni

- «Esci» revoca subito il token di quel dispositivo; `POST /api/auth/logout-all` (esci ovunque) e il cambio password
  (`python -m app.users passwd <nome>`) invalidano tutti i token dell'utente. I token durano 12 ore.

## 8. Limiti noti

- Limite dei tentativi di login e tetti di diario/richieste sono nel processo: un solo worker, si azzerano al riavvio.
- FastAPI 0.115.6 usa starlette 0.41.3, nell'intervallo di CVE-2025-62727 (Range sui file statici: mitigata, il
  frontend è servito senza Range) e CVE-2025-54121 (multipart: solo l'import Excel del Master). Aggiornare FastAPI a
  una versione con starlette ≥ 0.49.1 e rilanciare i test prima del rilascio.
- Nessun limite di frequenza oltre al login e ai tetti per utente (30 richieste al giorno, 1.000 pagine di diario).
