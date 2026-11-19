# STATISFY Sheet Manager — frontend

React 18 + TypeScript (strict) + Vite + react-router-dom. Nessuna libreria UI esterna: lo stile è quello del mockup (`src/styles/base.css` è la copia di `mockup/styles.css`, `src/styles/app.css` contiene gli stili delle schermate).

Il frontend **non calcola regole**: mostra `derived`, `totals`, `free_points` ecc. ricevuti dal backend e usa `POST /api/rules/preview` per le anteprime (creazione, level up). Contratto: `docs/API.md`.

## Comandi

```bash
npm install
npm run dev        # http://localhost:5174, /api in proxy verso http://127.0.0.1:8000 (backend FastAPI)
npm run dev:mock   # stessa app con un backend finto in memoria (VITE_MOCK=1, file .env.mock)
npm run build      # tsc -b + vite build -> dist/
npm run preview
```

## Utenti di sviluppo (seed del backend, replicati nel mock)

| username | password | ruolo |
|---|---|---|
| master | master | master |
| giocatore1 … giocatore6 | uguale allo username | player |

## Struttura

- `src/api/` — `client.ts` (fetch con token in localStorage, 401 → logout, messaggi `detail`), `types.ts` (tipi del contratto), `mock.ts` (solo con `VITE_MOCK=1`).
- `src/auth/` — `AuthContext` (utente/token), `AppData` (configurazione `/api/rules` e lista PG per il selettore).
- `src/layout/AppShell.tsx` — topbar (selettore PG, utente, logout, tema) e navigazione laterale (riga scorrevole su mobile).
- `src/components/` — `Win`, `Bar`, `RarityChip`, `TipRow` (riga compatta con tooltip), `StatRow`, `DerivedRow`, `Tabs`, `Toast`, `Grade`, `Status`.
- `src/pages/` — `Login`, `Scheda`, `Crea`, `LevelUp`, `Combattimento`, `Master`.

Rotte: `/login`, `/personaggi/:id`, `/personaggi/:id/level-up`, `/personaggi/:id/combattimento`, `/crea`, `/master` (solo master). `/` porta il master su `/master`, il giocatore sul suo ultimo PG (o su `/crea` se non ne ha).
