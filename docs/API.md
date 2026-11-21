# STATISFY Sheet Manager — contratto API (v1)

Fonte unica per backend (`backend/`, FastAPI) e frontend (`frontend/`, React + Vite + TS).
Le regole (formule, creazione, level up, combattimento, morte) vivono **solo nel backend**: il frontend mostra ciò che riceve.
Riferimento funzionale: il mockup in `mockup/` (`rules.js`, `data.js`, `screens/*.js`). Il comportamento va replicato.

- Base URL: `/api` (in sviluppo Vite fa da proxy verso `http://127.0.0.1:8000`).
- JSON ovunque; numeri come numeri, nessuna formattazione lato server.
- Auth: `Authorization: Bearer <token>` (JWT HS256, scadenza 12h). Ruoli: `master`, `player`.
- Errori: status HTTP + `{"detail": "messaggio in italiano leggibile dall'utente"}`. Validazione 422 con `detail` stringa (non la lista Pydantic grezza).
- Permessi: il `player` vede e modifica solo i PG con `owner_id` = proprio id; il `master` tutto. Tutte le rotte `/campaign`, `/npcs`, `/issues` e `/forge` sono solo master (403 altrimenti).
- Limiti e conflitti (tutti con `detail` in italiano):
  - **413** corpo oltre 1 MB (JSON) o 6 MB (multipart dell'import Excel).
  - **422** numeri non finiti nel JSON (`NaN`, `Infinity`, `1e999`) e interi oltre i 64 bit (anche negli id del percorso).
    Tetti: `amount` delle azioni di combattimento ≤ 10⁹, `hpPerTurn` e `absorb` degli effetti entro ±10⁹, `text` ≤ 300
    caratteri, `level` ≤ 9999, `corone`/`scellini` ≤ 10¹².
  - **409** blocco ottimistico: se due sessioni salvano lo stesso PG (o la stessa voce della Forgia) nello stesso istante,
    la seconda riceve 409 «modificato da un'altra sessione» e deve ricaricare. Vale anche per vincoli violati in
    contemporanea (es. due PG con lo stesso nome).
  - **429** su `POST /api/auth/login` dopo 10 tentativi falliti in 10 minuti per stesso utente e IP (50 per IP),
    con header `Retry-After`. Un login riuscito azzera il conteggio. Utente inesistente e password errata danno
    la stessa risposta nello stesso tempo.

## Utenti di sviluppo (seed)
| username | password | ruolo | display_name |
|---|---|---|---|
| master | master | master | Il Narratore |
| giocatore1 | giocatore1 | player | Giocatore 1 |
| giocatore2..6 | uguale allo username | player | Giocatore 2..6 |

Sono credenziali di sviluppo, create solo dal seed; vanno anche nel README.

## Auth
- `POST /api/auth/login` `{username, password}` → `{token, user}`
- `GET /api/auth/me` → `User`

`User = {id: int, username: str, display_name: str, role: "master"|"player"}`

## Regole
- `GET /api/rules` → configurazione statica per la UI:
```json
{
  "creation": {"base": 10, "bonus_points": 20, "min": 1, "name_min": 3, "name_max": 15},
  "level": {"auto_per_level": 1, "free_per_level": 10, "talent_every": 5},
  "regen": {"mp_pct": 15, "sp_pct": 25},
  "sources": [{"key": "iniziale", "label": "Iniziale", "help": "..."}, "... creazione, investiti, levelup, altro, titoli, oggetti"],
  "grades": ["Assoluto Novizio", "...", "Maestro"],
  "rarities": [{"name": "Comune", "key": "comune", "grade": 1, "weapon_base": [15, 30], "creature_mult": 1}, "..."],
  "classes": [{"id": "guerriero", "name": "Guerriero", "skill": "Attacco Possente", "skill_text": "...", "cost": "15 SP", "cooldown": 3, "equip": [{"name": "...", "type": "Arma", "weight": 3}]}],
  "kingdoms": [{"id": "valeria", "name": "Valeria", "text": "..."}],
  "positions": ["Mischia", "Media distanza", "Lunga distanza", "Elevato", "Coperto"],
  "power_ranks": [{"min": 1, "name": "Soldato Semplice"}, "..."],
  "slots": [{"key": "testa", "label": "Testa", "side": "left"}, "... 16 slot (left/right/bottom)"],
  "equip_types": [{"key": "dueMani", "label": "Due mani", "slots": ["manoPrincipale"], "two_handed": true}, "..."],
  "equip_formula_keys": ["difesa", "difesaMagica", "blocco"],
  "item_categories": [{"key": "equipaggiamento", "label": "Equipaggiamento"}, "... consumabili, materiali, altro"]
}
```
`classes[].equip` sono oggetti completi (stesso formato di `Item`, senza `id`/`slot`).

Slot (16): `testa, collo, spalle, mantello, torso, polsi, mani, cintura, gambe, piedi, anello1, anello2, ninnolo1, ninnolo2,
manoPrincipale, manoSecondaria`. Tipo di equipaggiamento → slot ammessi (modello InventoryType di WoW):

| tipo | slot |
|---|---|
| elmo, amuleto, spallacci, mantello, corazza, bracciali, guanti, cintura, gambali, stivali | testa, collo, spalle, mantello, torso, polsi, mani, cintura, gambe, piedi |
| anello / ninnolo | anello1 o anello2 / ninnolo1 o ninnolo2 |
| unaMano | manoPrincipale o manoSecondaria (doppia impugnatura libera per tutti) |
| manoPrincipale | solo manoPrincipale |
| dueMani | manoPrincipale e blocca manoSecondaria |
| scudo, tenuto | solo manoSecondaria |

- `POST /api/rules/preview` (autenticata; `stats` ≤ 100 righe, `inventory` ≤ 2000) `{stats: [StatRow...], item_bonus?: {}, equip?: {}, magia?: {}, inventory?: Item[], classe_id?: string}`
  (con `inventory` la colonna `oggetti`, `equip` e `item_bonus` vengono ricalcolati dall'equipaggiato, come per la scheda;
  con `classe_id` si aggiunge l'equipaggiamento iniziale della classe, indossato con la stessa logica della creazione
  (`rules.starting_equipment`: solo ciò che ha i requisiti soddisfatti), così l'anteprima della creazione guidata
  coincide con il PG creato. Classe inesistente → 422) → `{totals: {CODE: number}, derived: [Derived...]}`. Serve all'anteprima live (creazione, level up). Nessuna persistenza.

## Tipi

```ts
StatRow = { code: string; name: string; kind: "base"|"avanzata"; iniziale: number; creazione: number;
            investiti: number; levelup: number; altro: number; titoli: number;
            oggetti: number;     // bonus degli oggetti equipaggiati: calcolato dal server, mai inserito a mano
            note?: string|null; total: number }  // total calcolato dal server (somma di tutte le colonne)

// Le derivate delle statistiche avanzate compaiono solo se il PG ha quella statistica:
// LCK → bonusFortuna; KI → ki ("KI max" = 100 + KI×8, massimo della risorsa resources.ki), kiCombat, kiFuori, kiMeditazione.
Derived = { key: string; label: string; fmt: "int"|"int1"|"kg"|"pct"|"permin"|"mult"|"dec";
            base: number;        // valore formula (già limitato da cap)
            bonus: number;       // bonus oggetti sommato DOPO la formula (item_bonus manuale + oggetti equipaggiati).
                                 // Difesa, Difesa magica e Blocco degli oggetti invece entrano nella formula
                                 // ("Difesa equip × (1 + VIT/100)", "Blocco scudo + STR/40") e qui valgono 0.
            value: number;       // base + bonus, limitato da cap
            formula: string;     // es. "1 + INT/60" (già risolta per il PG)
            explain: string;     // es. "1 + 86/60"
            src: string; note?: string|null; cap?: number|null; disputed: boolean }

Character = {
  id: int; owner_id: int; owner_name: string;
  name: string; classe: string; level: int; exp_pct: number; regno: string; pvp: "Bianco"|"Grigio"|"Rosso";
  gilda: {nome: string; ruolo: string}; corone: int; scellini: int;
  stats: StatRow[]; item_bonus: {[key: string]: number};
  equip: {difesa: number; difesaMagica: number; blocco: number}; magia: {nucleo: int; talenti: int};
  resources: {hp: number; mp: number; sp: number; ki?: number};  // ki solo per chi ha la statistica avanzata KI
  titles:   {name; rarity; bonus: {[code]: number}}[];
  skills:   {name; lvl: int; pct: number|"MAX"; type: string; passive?: string}[];
  active_skills: {name; effect; lvl; pct; cost; cd: int}[];
  talents:  {name; rarity; origin; effect}[];
  inventory: Item[];      // illimitato: nessun limite di caselle, conta solo il peso (carico)
  pets:     {name; species; lvl; passive; skills: {name; lvl; pct}[]}[];
  curses:   {name; desc; bonus; malus}[];
  quests:   {name; progress; reward; rarity}[];
  reputation: {scope; target; value: number; range: number; label}[];
  combat: { position: string; turn: int; effects: {name; kind: "good"|"bad"; text; turns: int; hpPerTurn?: number; absorb?: number}[];
            cooldowns: {name; turns: int}[]; log: string[]; log_at?: string[] };   // log: ultime 20 righe, più recente per ultima
            // log_at: ora ISO (UTC) di ogni riga di log, parallelo dalla fine; "" per le righe scritte prima che esistesse.
            // Serve alla plancia per unire tiri e combattimento in un solo registro ordinato.
  death?: { lost: number; malus: string; bonus: string; protected: boolean } | null;  // ultimo esito, se appena morto
  // calcolati dal server a ogni risposta:
  equipped: {[slot: string]: string};   // slot → id oggetto; un'arma a due mani compare in entrambe le mani
  item_previews: {[itemId: string]: ItemPreview};  // per ogni equipaggiabile nella borsa: esito e confronto
  derived: Derived[]; totals: {[code: string]: number};
  free_points: {total: int; used: int; left: int};   // total = (level-1)*10, used = somma investiti
  power_rank: string; next_talent_level: int;
}
Item = { id: string; name: string; rarity: string; type: string;   // type descrittivo (Arma, Armatura, Cibo…)
         category: "equipaggiamento"|"consumabili"|"materiali"|"altro";  // dedotta se assente
         equip_type: string|null;   // chiave di equip_types (null = non equipaggiabile)
         slot: string|null;         // slot in cui è indossato (null = nella borsa)
         stats: {[code: string]: number};   // bonus alle statistiche → colonna "oggetti"
         bonus: {[key: string]: number};    // bonus alle derivate (chiavi di Derived; difesa/difesaMagica/blocco → formula)
         req: {level?: number; [code: string]: number};   // requisiti d'uso
         durability: {cur: number; max: number}|null; weapon_base: number|null;
         weight: number; qty: int; desc: string|null; stats_text: string;
         unmet: string[] }          // solo in uscita: requisiti non soddisfatti, es. ["Livello 80", "STR 200"]
ItemPreview = { ok: bool; error: string|null; unmet: string[]; slot: string|null;
                replaces: string[];                 // nomi degli oggetti che tornerebbero nella borsa
                stats: {[code]: number}; derived: {[key]: number} }   // differenze (valori finali) se lo si indossasse
CharacterSummary = { id; owner_id; owner_name; name; classe; level; exp_pct; regno; pvp; gilda; power_rank;
                     hp: number; hp_max: number }
```

## Personaggi
- `GET /api/characters` → `CharacterSummary[]` (player: solo i propri)
- `GET /api/characters/{id}` → `Character`
- `POST /api/characters` — creazione guidata → `Character` (201)
  `{name, classe_id, stats: {STR, DEX, VIT, INT}, regno_id}` — valori finali (base 10 ± punti).
  Validazioni (422 con messaggio): nome 3–15 solo lettere/numeri, unico (case-insensitive); ogni stat ≥ 1;
  somma(valore−10) == 20 esatti; classe e regno esistenti. Il PG nasce lv 1, exp 0, PvP Bianco, 20 Corone,
  risorse al massimo, active_skills = abilità di classe, inventory = equipaggiamento di classe (Comune) + "Corone d'Oro" ×20
  (gli oggetti di classe con requisiti soddisfatti vengono indossati subito),
  posizione "Mischia". owner = utente corrente (il master può passare `owner_id` opzionale).
- `PATCH /api/characters/{id}` — modifica parziale → `Character`. Si inviano solo le sezioni da cambiare; le liste
  si sostituiscono per intero. Tutto viene validato prima di salvare: se un controllo fallisce (422) non cambia nulla.
  - **Player** (solo i propri PG): `resources`, `combat.position`. Qualsiasi campo del Master → 403.
  - **Master**: anche `level` (int ≥ 1), `exp_pct` (0–100), `regno`, `pvp`, `gilda`, `corone`, `scellini`, `stats`,
    `item_bonus`, `equip`, `magia` e le liste `titles, skills, active_skills, talents, inventory, pets, curses, quests, reputation`.
  - Non modificabili da nessuno: `name`, `classe`, `id`, `owner_id` → 422.
  - `stats`: elenco completo delle righe `{code, name, kind, iniziale, creazione, investiti, levelup, altro, titoli, note}`.
    `code` 2–5 lettere maiuscole, unico; STR, DEX, VIT, INT restano e sono le sole `kind: "base"`; totale ≥ 0.
    `total` inviato viene ignorato (ricalcolato). La colonna **`oggetti`** è calcolata dagli oggetti equipaggiati:
    il valore salvato si conserva e inviarne uno diverso → 422. Cambiare il livello non tocca la colonna `levelup`.
  - `resources`: 0 ≤ valore ≤ massimo (calcolato sulle stat dopo la modifica), altrimenti 422.
    `ki` è facoltativo: se manca resta quello salvato; inviarlo per un PG senza la statistica KI → 422.
    Se `stats`, `equip` o `magia` abbassano un massimo, le risorse correnti scendono al nuovo massimo.
    Se il Master aggiunge la statistica KI il KI parte dal massimo; se la toglie, `resources.ki` sparisce.
  - Regole sulle liste (`rules.sheet_errors`):
    rarità nella scala a 8 gradi per titoli, talenti, oggetti e quest (per le quest può essere vuota);
    `lvl` (Grado) 1–10 e `pct` 0–100 o `"MAX"` per skill, skill attive e skill dei pet; `cd` ≥ 0; `lvl` dei pet ≥ 1;
    `qty` intero ≥ 0 e `weight` ≥ 0 per gli oggetti; bonus dei titoli e `stats` a mappa degli oggetti solo su codici di
    statistica esistenti; reputazione con `range` ≥ 0 e |`value`| ≤ `range` quando `range` > 0. `name` (e `target`
    della reputazione) obbligatorio.
  - `inventory` viene normalizzato (id assegnato se manca) e validato: slot ammessi dal tipo, nessuno slot occupato due
    volte, due mani + mano secondaria, quantità 1 per gli indossati (422). I requisiti non sono controllati qui (il
    Master può forzare), solo negli endpoint di equipaggiamento. I massimi di HP/MP/SP contano gli oggetti indossati.
  - `equip` e `item_bonus` restano correzioni manuali del Master che si sommano a quanto viene dagli oggetti.
  - Campi non previsti negli elementi delle liste si conservano.
- `DELETE /api/characters/{id}` — solo master → 204

### Level up
- `POST /api/characters/{id}/level-up` → `Character` — level+1; `levelup` +1 su ogni stat (base e avanzate); i punti liberi crescono di 10 (deriva da level). Se il nuovo livello è multiplo di 5, `combat.log` riceve "Nuovo talento disponibile…".
- `POST /api/characters/{id}/distribute` `{alloc: {CODE: int>=0}}` → `Character` — aggiunge a `investiti`; 422 se somma > `free_points.left` o codice inesistente.

### Equipaggiamento (ogni rotta → `Character`; player sui propri PG, master su tutti)
- `POST /api/characters/{id}/equipment/equip` `{item_id: string, slot?: SlotKey}` — indossa un oggetto della borsa.
  Senza `slot` usa il primo slot libero ammesso (altrimenti il primo ammesso). Chi occupava lo slot torna nella borsa;
  un'arma a due mani libera entrambe le mani; un'arma a una mano o uno scudo tolgono l'arma a due mani.
  Se l'oggetto è già indossato e `slot` è diverso, equivale a `move`.
  422: oggetto inesistente o non equipaggiabile, quantità ≠ 1, slot non ammesso
  ("… non va nello slot X. Slot ammessi: …"), requisiti non soddisfatti
  ("Impossibile equipaggiare X: requisiti non soddisfatti (Livello 80, STR 200).").
- `POST /api/characters/{id}/equipment/unequip` `{slot: SlotKey}` — rimette nella borsa l'oggetto dello slot
  (`manoSecondaria` bloccata da un'arma a due mani toglie l'arma). 422 se lo slot è vuoto.
- `POST /api/characters/{id}/equipment/move` `{from_slot: SlotKey, to_slot: SlotKey}` — sposta un oggetto indossato in
  un altro slot ammesso; l'occupante di `to_slot` va in `from_slot` se può, altrimenti nella borsa. 422 per armi a due
  mani, slot non ammesso o vuoto.
- Dopo ogni modifica HP/MP/SP correnti vengono limitati ai nuovi massimi.

### Combattimento (ogni rotta → `Character`, con riga aggiunta a `combat.log`)
- `POST /api/characters/{id}/combat/action` `{type: "damage"|"heal"|"spend_mp"|"spend_sp"|"spend_ki", amount: int>0}`
  damage: prima consuma gli effetti con `absorb` (rimossi a 0), poi HP (min 0). heal: HP fino al max.
  spend_*: 422 se insufficienti; spend_ki → 422 se il PG non ha la statistica KI.
- `POST /api/characters/{id}/combat/end-turn` — MP +mp_pct% e SP +sp_pct% del massimo (clamp), KI + derivata `kiCombat` (VIT/30, arrotondata; solo con la statistica KI, entro il massimo), applica `hpPerTurn`, decrementa turni di effetti e cooldown e rimuove quelli a 0, `turn`+1. HP non si rigenerano.
- `POST /api/characters/{id}/combat/effects` `{name, kind, turns, text?, hpPerTurn?, absorb?}`
- `DELETE /api/characters/{id}/combat/effects/{index}?name=` — `name` facoltativo: il nome dell'effetto che il client vede in quella posizione; se non corrisponde (lista cambiata in un'altra sessione) → 409 e nessuna rimozione
- `POST /api/characters/{id}/combat/reset` — turno 1, effetti/cooldown/log svuotati.
- `POST /api/characters/{id}/death` `{hubris: bool, respawn: "checkpoint"|"here"}` — regola morte (−1,5 livelli, −3 per Hubris, lv 1–2 protetti); respawn checkpoint → risorse al 50% (KI incluso), here → 1 HP e MP/SP/KI invariati; effetti e cooldown azzerati; valorizza `death`.

## Master
- `GET /api/campaign` → `{id, name, session: int, master_name, open_quests: {name, who, rarity, due}[]}`
- `POST /api/campaign/session` → campagna con `session`+1
- `GET /api/npcs` → `Npc[]`; `POST /api/npcs`; `PATCH /api/npcs/{id}` (trust, campi testuali)
- `POST /api/npcs/{id}/interactions` `{text}` → `Npc` (aggiunge a `history` `{session, text, at}` e aggiorna `last` = "Sessione N — text")
  `Npc = {id, name, level, race, place, role, trust: "Scarso"|"Neutrale"|"Buono"|"Eccellente", knows, debts, last, secret, history: {session, text, at}[]}`
- `GET /api/issues` → `{id, title, text, sev: "bad"|"warn", resolved: bool, decision: str|null}[]`; `PATCH /api/issues/{id}` `{resolved?, decision?}`

## Import schede Excel (solo master)
- `POST /api/import/excel` — `multipart/form-data`:
  - `file` (obbligatorio): `.xlsx`, massimo 5 MB (413 oltre, 422 se non è un `.xlsx` leggibile). 422 anche se
    l'archivio si espande oltre 50 MB o ha più di 1000 elementi (zip bomb) o se un foglio supera 10.000 righe × 200 colonne.
  - `dry_run` (facoltativo, default `false`): `true` = solo report, nessuna modifica al DB
  - `owners` (facoltativo): JSON `{"NomePG": "username"}` per i PG **nuovi**; senza, il PG nuovo va al Master che importa. 422 se lo username non esiste.
  - `create_issues` (facoltativo, default `true`): crea/aggiorna le questioni del Master con le incoerenze
  - 403 per i player.

Cosa legge (solo valori delle celle; per le celle con formula il valore calcolato salvato da Excel — le formule non vengono portate, le derivate le ricalcola il backend):
- ogni foglio con `A4 = "Nome Personaggio:"` è una scheda: nome `B4`, classe `D4`, livello `B5`, EXP `D5`;
- righe 9–24 = statistiche (sigla tra parentesi o in fondo all'etichetta, es. `Forza (STR)`, `Carisma CHA`); le colonne
  Valore Iniziale / Punti Creazione / Investiti / Level Up / Altro / Titoli sono trovate per intestazione (riga 8).
  Colonne extra `Punti …` (es. «Punti Imprese Diplomatiche» di Eric) sono sommate in `altro` con nota sulla riga e segnalate;
- tabella titoli (colonna F `Nome`, G `Rarità`, da H un bonus per statistica nell'ordine delle righe 9…) oppure tabella talenti (F `Talento`);
- colonna `Bonus Item` delle derivate → `item_bonus`;
- se il file ha una sola scheda, i fogli `Skills`, `Skill Attive`, `Inventario`, `Talenti`, `Pets`, `Maledizioni`, `Quest`
  riempiono le liste omonime (le monete `Corone`/`Scellini` dell'inventario aggiornano `corone`/`scellini`).

Scrittura: il PG si cerca per nome (senza distinzione di maiuscole). Se esiste viene **aggiornato** (classe, livello, EXP, statistiche
e solo le liste presenti nel file; proprietario, regno, PvP, gilda, equip, magia, combattimento restano; le risorse attuali sono
limitate ai nuovi massimi); altrimenti viene **creato** (regno «—», PvP Bianco, risorse al massimo).

Risposta:
```json
{"file": "Scheda.xlsx", "dry_run": false,
 "characters": [{"name": "Corax", "sheet": "Corax", "action": "updated"|"created", "id": 3, "owner": "giocatore3",
                 "level": 181, "classe": "Monaco", "stats": 7, "sections": {"titles": 12}}],
 "issues": [{"severity": "bad"|"warn"|"info", "sheet": "Corax", "character": "Corax",
             "message": "Livello 181: «Punti Level Up» = 185 su STR, DEX, VIT, INT, attesi 180 (…)"}],
 "summary": {"bad": 0, "warn": 3, "info": 6}, "issue_ids": [7]}
```
Le incoerenze (`warn`) **non vengono corrette**: i dati sono importati come sono nell'Excel e segnalati. `bad` = foglio o file non importato
(nome non valido, livello non intero, nessuna scheda). `info` = note (derivate dell'Excel con formula diversa da quella dell'app, campi assenti, ecc.).
Con `create_issues` ogni PG con incoerenze ha una questione `"Import Excel — Nome"` (testo = elenco); reimportando si aggiorna quella aperta.

Stesso import da riga di comando (cartella `backend`): `.venv\Scripts\python -m app.excel_import FILE.xlsx [...] [--dry-run] [--owner Nome=username] [--no-issues]`.

## Forgia del Master (solo master)
Wizard di creazione dei contenuti (porting di `mockup/screens/forgia.js`, `wizards-master.js`, `wizards-magia.js`) e libreria della campagna.
Tutte le rotte `/api/forge/*` sono solo master (403 per i player). Regole e costanti in `backend/app/rules.py` (sezione «Forgia del Master»),
logica dei wizard (validazione per passo, anteprima, voce, assegnazione) in `backend/app/forge.py`. Decisioni del 20/11/2026: `docs/PROPOSTE.md`.

`ForgeKind = "skills"|"classes"|"races"|"titles"|"npcs"|"encounters"|"spells"|"miracles"|"items"` (wizard Skill, Classe, Razza, Titolo, PNG, Incontro, Incantesimo, Miracolo, Oggetto).

- `GET /api/forge/meta` → opzioni dei wizard: costanti (`skill_types`, `weapon_grade_rows`, `class_types`, `race_templates`, `relations`,
  `sizes`, `environments`, `difficulty`, `drop_kinds`, `spheres`, `metamagic`, `sphere_meta`, `zones`, `ley_lines`, `backlash_bands`,
  `gods`, `natures`, `favor`, `against`, …), `steps: {ForgeKind: [etichette dei passi]}`, `rarities`, `roman`, `grades`,
  `stat_codes` (codici delle statistiche dei PG), `item_bonus` (valori derivati che un oggetto può aumentare), `equip_types`, `assignable`, `characters: [{id, name, level, classe, exp_pct}]`,
  `library_skills`, `known_titles` (libreria + titoli dei PG), `classes` (base + libreria), `races`, `kingdoms`, `session`.
- `GET /api/forge/library[?kind=ForgeKind]` → `ForgeEntry[]` (ordine di creazione).
- `POST /api/forge/preview` `{kind, draft}` → `{kind, steps: [str], first_bad: int, computed: {...}}`.
  `draft` è la bozza libera del wizard (campi del modulo, vedi `frontend/src/forge/*.tsx`); `steps` ha un messaggio per passo
  (`""` = passo valido), `first_bad` il primo passo non valido (−1 = tutto valido); `computed` i valori dell'anteprima calcolati dal server
  (gradi della skill, statistiche di un PG di livello 1 della razza, variazioni del titolo sul PG, creature, difficoltà stimata, EXP per PG,
  livelli/costo/backlash/danno dell'incantesimo, Fede/favore/potenza del miracolo, requisiti sul PG…). Non salva niente.
- `POST /api/forge/entries` `{kind, draft}` → 201 `{entry: ForgeEntry, messages: [str]}`; 422 con il primo passo non valido
  (`"Passo 3 (Gradi): riga 1: manca il valore del Grado III."`). Se la bozza assegna un PG (`charId`) il PG viene modificato:
  - skill: nuova voce in `skills` (passiva, Grado I · 0%) o `active_skills` (attiva, `cost` "15 SP");
  - titolo: aggiunto a `titles` e bonus sommati alla colonna `titoli`; con `prev` = un titolo che il PG ha, l'**evoluzione lo sostituisce**
    e ne toglie i bonus; bonus su statistiche che il PG non ha: ignorati e segnalati;
  - incantesimo (`assign`, origine grimorio o pratica) e miracolo (`assign`): nuova skill attiva Grado I · 1% con `kind` "Incantesimo"/"Miracolo";
    sfere mancanti (incantesimo) o classe/Fede/favore insufficienti (miracolo) richiedono `force: true`.
  - oggetto: va nella borsa del PG (`inventory`, `slot` null, nuovo `id`); si equipaggia dalla scheda se i requisiti sono soddisfatti;
  - PNG: crea anche il PNG nell'archivio (`/api/npcs`, `entry.npc_id`); i campi in più (personalità, background, combattimento) restano in `entry.data.npc`.
- `DELETE /api/forge/entries/{id}` → 204. Toglie la voce dalla libreria; non annulla assegnazioni né cancella il PNG.
- `POST /api/forge/drop-profile` `{creatures: [{name, level, rarity, size, count}], kind?: "Avaro"|"Normale"|"Generoso"|"Tesoro", seed?: int}` → `DropProfile`.
  Profilo di drop generato al momento: tabella d100 (soglie del tipo di profilo, rarità a partire dalla creatura più rara), un tiro per creatura (max 6),
  monete (Corone = numero × grado² / 4 ±50%, più 0–19 Scellini) e materiali. Senza `seed` è casuale.
- `POST /api/forge/drop-roll` `{profile: DropProfile, seed?: int}` → `{rolls: [{d100, what, rarity}], text}` («Tira il bottino»: `text` va nel bottino deciso dal Master).
- `POST /api/forge/party/rest` `{char_ids?: int[] (max 200), clear_effects?: bool = true}` → `{rested: [{id, name}]}`: **riposo**. HP, MP, SP (e KI)
  al massimo per i PG scelti (tutti se `char_ids` manca); con `clear_effects` toglie effetti e ricariche e riporta il turno a 1. L'esito della morte
  sparisce e ogni PG ha una riga «Riposo: …» nel registro del combattimento. 404 se un id non esiste.
- `GET /api/forge/encounters/{id}/exp?mode=intera|divisa` → `{mode, party: int, rows: ExpRow[]}`: anteprima della chiusura.
- `POST /api/forge/encounters/{id}/close` `{mode: "intera"|"divisa"}` → `{entry, results: ExpRow[], messages}`; 409 se già chiuso.
  Assegna l'EXP a ogni PG che partecipa e applica i level up (come `POST /characters/{id}/level-up`: +1 a ogni statistica e 10 punti liberi
  per livello, riga nel registro di combattimento). `entry.closed = {mode, at, session, results, text}`.

- `GET /api/forge/entries/{id}/assign-preview?char_id=` → `AssignPreview`: cosa succede assegnando una voce già salvata
  (`titles`, `items`, `skills`, `spells`, `miracles`) al PG: `{error, issues, replaces, lines: [{code, missing, delta, before, after, total_before, total_after}], unmet}`.
  `error` blocca (titolo già posseduto o incompatibile, skill omonima, incantesimo improvvisato); `issues` richiedono `force`
  (sfere mancanti, classe/Fede/favore insufficienti); `lines` = variazioni della colonna «Titoli» (con l'evoluzione che toglie il precedente);
  `unmet` = requisiti dell'oggetto non soddisfatti (l'oggetto va comunque nella borsa).
- `POST /api/forge/entries/{id}/assign` `{char_id, force?}` → `{entry, messages}`; 422 con `error` o con il primo avviso senza `force`.
  Stesse regole del wizard; l'assegnazione si aggiunge a `entry.data.assignments` `[{char_id, name, at, session, forced}]`.
- `POST /api/forge/encounters/{id}/live` `{action: "start"|"stop"|"next_turn"|"damage"|"heal", index?, amount?}` → `{entry, message}`.
  Incontro in corso sulla plancia: `start` lo avvia (e sospende l'altro in corso), poi turni e Vita delle creature per riga
  (`index` della creatura, Vita = numero × Vita di una, tra 0 e il massimo). Stato in `entry.data.live = {active, turn, hp: [...]}`;
  409 se l'incontro è chiuso o non è in corso. La chiusura lo ferma.
- `GET /api/forge/board` → dati della **Plancia di comando** del Master in una chiamata: `{campaign, party: [{id, name, classe, owner_name,
  level, exp_pct, power_rank, resources, maxes, dead, effects}], npcs, encounters: [ForgeEntry + {live, creatures: [{name, count, rarity,
  level, max, hp}]}] (non chiusi), active_encounter_id, library (voci assegnabili), counts: {ForgeKind: n}, log: [{at, text, entry_id, kind}]}`.
  `log` = registro della sessione corrente (creazioni, assegnazioni, turni, chiusure: `entry.data.events`), dal più recente.

```
ForgeEntry = {id, kind: ForgeKind, name, summary, data: {...voce del wizard}, assigned_to: int|null, assigned_name: str|null,
              npc_id: int|null, closed: {mode, at, session, results: ExpRow[], text}|null, session: int, created_at: str}
DropProfile = {kind, text, top: rarità, rows: [{from, to, what, rarity}], rolls, corone, scellini, mats: [{name, qty, rarity}]}
ExpRow = {id, name, level, exp_pct, full: num, pct: num, after_level, after_exp, ups}
```

Regole usate (tutte nel backend):
- **EXP** (Progressione, Sezione 2): pari livello 2%, ±1 punto per livello di differenza (0–10%), dal livello 10 metà, dal 50 un quarto;
  poi **× grado³ della rarità** della creatura (Non Comune ×8, Raro ×27 … Divino ×512) × numero di creature. «Intera»: ogni PG prende la sua EXP
  (calcolata sul suo livello alla chiusura); «divisa»: la sua EXP ÷ numero di PG che partecipano. Ogni 100% è un livello.
- **Creature** (Combat): Danno = (10 + L×6) × grado³; Vita = (40 + L×20) × grado³ × taglia (Fragile ×0,5, Normale ×1, Robusta ×1,5).
- **Difficoltà**: la decide il Master (`masterDiff`); la stima (proposta) è (ΣVita × ΣDanno creature) / (ΣVita × ΣDanno gruppo).
- **Skill**: un valore per ognuno dei 10 Gradi per ogni riga «cosa migliora» (nessuna formula unica).
- **Razze**: statistiche e talenti razziali liberi (qualsiasi statistica, anche negativa, nessun limite).
- **Incantesimi**: Mana 10 × L × (L+1), lancio ⌈L/3⌉ turni, ricarica ⌈L/2⌉, backlash L×2 + fattori, danno 15–30 × efficacia × molt. magico × composizione.
- **Miracoli**: Fede 5 × L × (L+1), Mana 12,5 × L × (L+1), favore richiesto per livello (+1 grado fuori dominio), potenza base × L × (1 + Fede/100) × molt. favore.

## Tavolo: tiri d100 e richieste del Master
Plancia del giocatore e parte «tavolo» della plancia del Master (porting di `mockup/screens/plancia.js`). Rotte in `backend/app/routers/table.py`.
Il d100 sono due d10, decine (0–9 → 00–90) e unità (0–9); **00 + 0 = 100**. **Il risultato lo genera il server** con `secrets.randbelow(10)`
(crittografico): il client chiede il tiro, riceve `tens/units/natural/total` e anima i dadi fino a quei valori. Il tiro somma i modificatori
allegati e l'esito lo legge il Master.

**Critici (regola decisa dal Master).** Prima di tirare il giocatore dichiara `call`: `"sopra"` o `"sotto"`. Conta il **naturale**, non il totale:

| `call` | supercritico | critico | resto |
|---|---|---|---|
| `"sopra"` | 100 | 91–99 | null |
| `"sotto"` | 1 | 2–9 | null |

Un 100 dichiarato «sotto» o un 1 dichiarato «sopra» non è critico. Il server calcola `crit` (`null` | `"critico"` | `"supercritico"`) e lo salva
col tiro; il client non lo invia.

- `POST /api/table/characters/{id}/rolls` `{call: "sopra"|"sotto", reason?: str ≤120, mods?: Mod[] (max 30), request_id?: int}` → 201 `Roll`.
  `call` è **obbligatorio** (422 se manca o non è uno dei due valori), anche quando tira il Master per conto del PG.
  Player solo sui propri PG (404 altrimenti), master su tutti. Ogni `Mod` è validato (422 con messaggio): `kind` tra
  `"Skill"|"Skill attiva"|"Titolo"|"Talento"|"Fortuna"`, `name` presente nella scheda del PG per quel tipo (`skills`, `active_skills`, `titles`,
  `talents`; per `Fortuna` solo `"Bonus Fortuna sui tiri"` e solo se il PG ha la derivata `bonusFortuna`), `mod` intero tra −999 e 999,
  `text` facoltativo ≤300. Il server calcola `natural` e `total = natural + Σ mod`. Se `request_id` è una richiesta **aperta di quel PG**
  diventa `risolta` con `roll_id`; altrimenti viene ignorata (`Roll.request_id` null).
- `POST /api/table/rolls` `{reason?: str, call?: "sopra"|"sotto", secret?: bool}` → 201 `Roll` (solo master; `char_id` null, `by` "master",
  nessun allegato). `call` facoltativo: senza dichiarazione `crit` è sempre null.
- `GET /api/table/rolls[?char_id=&limit=50]` → `Roll[]` dal più recente (`limit` 1–200). Player: solo i tiri dei suoi PG, mai i segreti
  (né i tiri del Master); master: tutti, segreti compresi.
- `POST /api/table/requests` `{char_id, what: str 2–80, note?: str ≤200}` → 201 `RollRequest` (solo master; 404 PG inesistente).
- `GET /api/table/requests[?status=aperta|risolta&limit=50]` → `RollRequest[]` dalla più recente. Player: quelle dei suoi PG; master: tutte.
- `DELETE /api/table/requests/{id}` → 204 (solo master): annulla la richiesta (la elimina; l'eventuale tiro di risposta resta nel registro).

```
Mod = {kind, name, mod: int, text: str}
Roll = {id, char_id: int|null, char_name: str ("Master" se char_id null), by: "giocatore"|"master", author_id, author_name,
        reason, tens: 0–9, units: 0–9, natural: 1–100, mods: Mod[], total: int, call: "sopra"|"sotto"|null,
        crit: "critico"|"supercritico"|null, secret: bool, request_id: int|null, created_at: ISO}
RollRequest = {id, char_id, char_name, what, note, status: "aperta"|"risolta", roll_id: int|null,
               roll_total: int|null, roll_natural: int|null, roll_crit: "critico"|"supercritico"|null, created_at: ISO}
```
Il frontend aggiorna tiri e richieste ogni 5 s solo con la pagina visibile (polling leggero), così Master e giocatori si vedono a vicenda.

## Diario dell'avventuriero (`/api/journal`, ogni utente)

Visibilità `privato` (solo l'autore, nemmeno il Master) o `gruppo` (tutti). Solo l'autore modifica; il Master elimina le pagine del gruppo.
- `GET /api/journal?scope=tutto|miei|gruppo&char_id&tag&q&limit≤200&offset` → `{total, tags, items: JournalEntry[]}` (fissate prima, poi dalla più recente).
- `GET /api/journal/attachables?char_id` → `{roll, item, title, skill, talent, quest}`: candidati da allegare (tiri non segreti del PG, scheda, quest del PG e della campagna).
- `POST /api/journal` `{title ≤120, body ≤20000, tags ≤8, char_id?, visibility, pinned, attachments ≤12: [{kind, ref}]}` → 201 `JournalEntry`.
  Gli allegati li risolve il server in istantanee `{kind, ref, label, detail, rarity}`: 422 se l'elemento non c'è o non è dell'utente;
  un tiro segreto solo su pagina privata. Max `JOURNAL_MAX_ENTRIES` (1000) pagine per utente.
- `PATCH /api/journal/{id}` (autore) stessi campi + `version`: 409 se cambiata nel frattempo. `DELETE /api/journal/{id}` → 204.

## Richieste al Master (`/api/tickets`)

Tipi `funzione` | `contenuto` | `regola`; stati `aperta` → `in_esame` → `risolta` | `respinta` (o `ritirata` dall'autore).
Il giocatore vede solo le sue; il Master tutte. Chiusa da più di `STATISFY_TICKET_ARCHIVE_DAYS` giorni (default 7) → archivio, solo lettura (409 su ogni modifica).
- `GET /api/tickets/summary` → `{count}`: Master = richieste aperte; giocatore = sue con risposte non lette.
- `GET /api/tickets?scope=attive|archivio&status&kind&q&limit&offset` → `{total, counts, archive_days, items: Ticket[]}` (archivia prima le scadute).
- `POST /api/tickets` `{kind, title 3–120, body ≤5000, char_id?}` → 201. 429 oltre 20 richieste in attesa per utente.
- `GET /api/tickets/{id}`: aprirla come autore la segna come letta.
- `POST /api/tickets/{id}/messages` `{text ≤2000}` (autore o Master; max 100 messaggi).
- `PATCH /api/tickets/{id}` `{version?, status?, answer?, title?, body?, promote_issue?}`.
  Il Master cambia stato e risposta (per chiudere serve la risposta); l'autore solo `ritirata` o, finché `aperta`, titolo e testo (403/409 altrimenti).
  `promote_issue` su una `regola` risolta crea (una volta) una questione delle regole decisa → `issue_id`.
- `POST /api/tickets/{id}/archive` (Master, solo chiuse) e `POST /api/tickets/rotate` (Master) → `{archived, archive_days}`.

## Servizio e produzione

- `GET /api/health` → `{"status": "ok"}` senza login. Con `STATISFY_ENV=production` niente `/docs` e `/openapi.json`. Vedi `docs/DEPLOY.md`.

## Seed
All'avvio, se il DB è vuoto: utenti sopra, campagna "Campagna di Alba Chiara" (sessione 15), i 6 PG di `mockup/data.js`
(Kelvin completo con inventario MMORPG: Thanatos a due mani e Spalla del Simbionte equipaggiati → giocatore1, Eric → giocatore2, Corax → 3, Deniel → 4, Connor → 5, Dante → 6), i 3 PNG, quest aperte e questioni (con le decisioni già prese).
Se il DB esiste già, all'avvio una migrazione leggera dà un `id` agli oggetti che non ce l'hanno e sposta il vecchio campo
testuale `stats` in `stats_text` (gli oggetti restano nella borsa; nessuna colonna nuova nel DB: l'inventario è JSON).
Per avere gli oggetti di esempio di Kelvin: `python -m app.seed --reset`.
La tabella della libreria della Forgia (`forge_entries`) viene creata all'avvio anche sui DB esistenti; parte vuota.
Lo stesso vale per le tabelle del tavolo (`rolls`, `roll_requests`): create all'avvio (`create_all`), vuote, senza toccare i dati esistenti.
`create_all` però non aggiunge colonne a tabelle già esistenti: per quelle c'è `seed.migrate_schema` (lista `ADDED_COLUMNS`), che all'avvio
fa `ALTER TABLE … ADD COLUMN` per le colonne mancanti. Così `rolls.call` e `rolls.crit` compaiono nei DB creati prima dei critici; i tiri
vecchi restano con `call`/`crit` null.
