# STATISFY Sheet Manager — contratto API (v1)

Fonte unica per backend (`backend/`, FastAPI) e frontend (`frontend/`, React + Vite + TS).
Le regole (formule, creazione, level up, combattimento, morte) vivono **solo nel backend**: il frontend mostra ciò che riceve.
Riferimento funzionale: il mockup in `mockup/` (`rules.js`, `data.js`, `screens/*.js`). Il comportamento va replicato.

- Base URL: `/api` (in sviluppo Vite fa da proxy verso `http://127.0.0.1:8000`).
- JSON ovunque; numeri come numeri, nessuna formattazione lato server.
- Auth: `Authorization: Bearer <token>` (JWT HS256, scadenza 12h). Ruoli: `master`, `player`.
- Errori: status HTTP + `{"detail": "messaggio in italiano leggibile dall'utente"}`. Validazione 422 con `detail` stringa (non la lista Pydantic grezza).
- Permessi: il `player` vede e modifica solo i PG con `owner_id` = proprio id; il `master` tutto. Tutte le rotte `/campaign`, `/npcs`, `/issues` sono solo master (403 altrimenti).

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

- `POST /api/rules/preview` `{stats: [StatRow...], item_bonus?: {}, equip?: {}, magia?: {}, inventory?: Item[]}`
  (con `inventory` la colonna `oggetti`, `equip` e `item_bonus` vengono ricalcolati dall'equipaggiato, come per la scheda) → `{totals: {CODE: number}, derived: [Derived...]}`. Serve all'anteprima live (creazione, level up). Nessuna persistenza.

## Tipi

```ts
StatRow = { code: string; name: string; kind: "base"|"avanzata"; iniziale: number; creazione: number;
            investiti: number; levelup: number; altro: number; titoli: number;
            oggetti: number;     // bonus degli oggetti equipaggiati: calcolato dal server, mai inserito a mano
            note?: string|null; total: number }  // total calcolato dal server (somma di tutte le colonne)

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
  resources: {hp: number; mp: number; sp: number};
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
            cooldowns: {name; turns: int}[]; log: string[] };   // log: ultime 20 righe, più recente per ultima
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
- `PATCH /api/characters/{id}` — modifica parziale. Player: solo `resources`, `combat.position`. Master: anche
  `exp_pct, regno, pvp, gilda, corone, scellini, item_bonus, equip, magia` e le liste
  (`titles, skills, active_skills, talents, inventory, pets, curses, quests, reputation`, sostituzione intera).
  `name`, `classe`, stats di creazione non sono modificabili (422). → `Character`
  `inventory` viene normalizzato (id assegnato se manca) e validato: slot ammessi dal tipo, nessuno slot occupato due
  volte, due mani + mano secondaria, quantità 1 per gli indossati (422 con messaggio). I requisiti non sono controllati
  qui (il Master può forzare), solo negli endpoint di equipaggiamento. `equip` e `item_bonus` restano correzioni
  manuali del Master che si sommano a quanto viene dagli oggetti.
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
- `POST /api/characters/{id}/combat/action` `{type: "damage"|"heal"|"spend_mp"|"spend_sp", amount: int>0}`
  damage: prima consuma gli effetti con `absorb` (rimossi a 0), poi HP (min 0). heal: HP fino al max.
  spend_*: 422 se insufficienti.
- `POST /api/characters/{id}/combat/end-turn` — MP +mp_pct% e SP +sp_pct% del massimo (clamp), applica `hpPerTurn`, decrementa turni di effetti e cooldown e rimuove quelli a 0, `turn`+1. HP non si rigenerano.
- `POST /api/characters/{id}/combat/effects` `{name, kind, turns, text?, hpPerTurn?, absorb?}`
- `DELETE /api/characters/{id}/combat/effects/{index}`
- `POST /api/characters/{id}/combat/reset` — turno 1, effetti/cooldown/log svuotati.
- `POST /api/characters/{id}/death` `{hubris: bool, respawn: "checkpoint"|"here"}` — regola morte (−1,5 livelli, −3 per Hubris, lv 1–2 protetti); respawn checkpoint → risorse al 50%, here → 1 HP e MP/SP invariati; effetti e cooldown azzerati; valorizza `death`.

## Master
- `GET /api/campaign` → `{id, name, session: int, master_name, open_quests: {name, who, rarity, due}[]}`
- `POST /api/campaign/session` → campagna con `session`+1
- `GET /api/npcs` → `Npc[]`; `POST /api/npcs`; `PATCH /api/npcs/{id}` (trust, campi testuali)
- `POST /api/npcs/{id}/interactions` `{text}` → `Npc` (aggiunge a `history` `{session, text, at}` e aggiorna `last` = "Sessione N — text")
  `Npc = {id, name, level, race, place, role, trust: "Scarso"|"Neutrale"|"Buono"|"Eccellente", knows, debts, last, secret, history: {session, text, at}[]}`
- `GET /api/issues` → `{id, title, text, sev: "bad"|"warn", resolved: bool, decision: str|null}[]`; `PATCH /api/issues/{id}` `{resolved?, decision?}`

## Seed
All'avvio, se il DB è vuoto: utenti sopra, campagna "Campagna di Alba Chiara" (sessione 15), i 6 PG di `mockup/data.js`
(Kelvin completo con inventario MMORPG: Thanatos a due mani e Spalla del Simbionte equipaggiati → giocatore1, Eric → giocatore2, Corax → 3, Deniel → 4, Connor → 5, Dante → 6), i 3 PNG, quest aperte e questioni (con le decisioni già prese).
Se il DB esiste già, all'avvio una migrazione leggera dà un `id` agli oggetti che non ce l'hanno e sposta il vecchio campo
testuale `stats` in `stats_text` (gli oggetti restano nella borsa; nessuna colonna nuova nel DB: l'inventario è JSON).
Per avere gli oggetti di esempio di Kelvin: `python -m app.seed --reset`.
