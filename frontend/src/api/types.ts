// Tipi del contratto API v1 (docs/API.md). Il frontend non calcola regole: mostra ciò che riceve.
import type { Mech } from "./mech";

export type Role = "master" | "player";

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  /** Password provvisoria data dal Master: finché non la cambia, l'utente vede solo la schermata di cambio. */
  must_change_password?: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export type SourceKey = "iniziale" | "creazione" | "investiti" | "levelup" | "altro" | "titoli" | "oggetti";
export const SOURCE_KEYS: SourceKey[] = ["iniziale", "creazione", "investiti", "levelup", "altro", "titoli", "oggetti"];

export interface StatRow {
  code: string;
  name: string;
  kind: "base" | "avanzata";
  iniziale: number;
  creazione: number;
  investiti: number;
  levelup: number;
  altro: number;
  titoli: number;
  /** Bonus degli oggetti equipaggiati: calcolato dal server, mai inserito a mano. */
  oggetti: number;
  note?: string | null;
  total: number;
}

export type DerivedFmt = "int" | "int1" | "kg" | "pct" | "permin" | "mult" | "dec";

export interface Derived {
  key: string;
  label: string;
  fmt: DerivedFmt;
  base: number;
  bonus: number;
  value: number;
  formula: string;
  explain: string;
  src: string;
  note?: string | null;
  cap?: number | null;
  disputed: boolean;
}

export type Pvp = "Bianco" | "Grigio" | "Rosso";

export interface Title {
  name: string; rarity: string; bonus: Record<string, number>;
  /** Campi facoltativi (voci della Forgia o aggiunte a mano): come si ottiene, effetto, evoluzione */
  how?: string; effect?: { type: string | null; text: string } | string | null; next?: string | null; evoCond?: string; prev?: string | null;
}
/** Ciclo completato di una skill (passiva ottenuta al Grado X). */
export interface SkillEvolution { ciclo: number; passiva: string; at: string }
export interface Skill {
  name: string; lvl: number; pct: number | "MAX"; type: string; passive?: string | null; mech?: Mech;
  /** Cicli di 10 Gradi completati: livello totale = cicli × 10 + lvl */
  cicli?: number; evoluzioni?: SkillEvolution[]; origine?: string; ciclo?: number;
}
/** Skill attive, incantesimi e miracoli stanno tutti in `active_skills`: li distingue `kind` (assente = skill attiva). */
export type ActiveKind = "Skill" | "Incantesimo" | "Miracolo";
export interface ActiveSkill {
  name: string; effect: string; lvl: number; pct: number | "MAX"; cost: string; cd: number;
  kind?: ActiveKind | string; spheres?: string[]; god?: string;
  /** Meccanica strutturata (motore di combattimento): facoltativa */
  mech?: Mech; efficacia?: number;
  cicli?: number; evoluzioni?: SkillEvolution[];
}
export interface Talent { name: string; rarity: string; origin: string; effect: string; mech?: Mech }
export type SlotKey =
  | "testa" | "collo" | "spalle" | "mantello" | "torso" | "polsi" | "mani" | "cintura" | "gambe" | "piedi"
  | "anello1" | "anello2" | "ninnolo1" | "ninnolo2" | "manoPrincipale" | "manoSecondaria";
export type ItemCategory = "equipaggiamento" | "consumabili" | "materiali" | "altro";

export interface InventoryItem {
  id: string;
  name: string;
  rarity: string;
  type: string;
  category: ItemCategory;
  /** Chiave di RulesConfig.equip_types; null = non equipaggiabile */
  equip_type: string | null;
  /** Slot in cui è indossato; null = nella borsa */
  slot: SlotKey | null;
  /** Bonus alle statistiche (colonna "Oggetti") */
  stats: Record<string, number>;
  /** Bonus alle derivate (difesa/difesaMagica/blocco entrano nella formula, gli altri si sommano dopo) */
  bonus: Record<string, number>;
  req: Record<string, number>;
  durability: { cur: number; max: number } | null;
  weapon_base: number | null;
  weight: number;
  qty: number;
  desc: string | null;
  stats_text: string;
  /** Solo in uscita: requisiti non soddisfatti, es. ["Livello 80", "STR 200"] */
  unmet: string[];
}

export interface ItemPreview {
  ok: boolean;
  error: string | null;
  unmet: string[];
  slot: SlotKey | null;
  replaces: string[];
  stats: Record<string, number>;
  derived: Record<string, number>;
}
export interface Pet { name: string; species: string; lvl: number; passive: string; skills: { name: string; lvl: number; pct: number | "MAX" }[] }
export interface Curse { name: string; desc: string; bonus: string; malus: string }
export interface Quest { name: string; progress: string; reward: string; rarity: string }
export interface Reputation { scope: string; target: string; value: number; range: number; label: string }

export interface Effect {
  name: string;
  kind: "good" | "bad";
  text: string;
  turns: number;
  hpPerTurn?: number;
  absorb?: number;
}

export interface Combat {
  position: string;
  turn: number;
  effects: Effect[];
  cooldowns: { name: string; turns: number }[];
  log: string[];
  /** Ora ISO di ogni riga di `log` (parallelo dalla fine; "" = riga senza ora). */
  log_at?: string[];
}

export interface Death {
  lost: number;
  malus: string;
  bonus: string;
  protected: boolean;
}

/** Risorse correnti. `ki` esiste solo per i PG con la statistica avanzata KI (KI max = 100 + KI×8). */
export interface Resources { hp: number; mp: number; sp: number; ki?: number }
export type ResourceKey = keyof Resources;

/** Profilo descrittivo (solo testo, nessun effetto sulle regole). */
export interface Profile {
  razza: string; eta: string; sesso: string; patria: string; alleanze: string;
  capelli: string; occhi: string; abbigliamento: string; segni: string; statura: string;
}

export interface Character {
  id: number;
  owner_id: number;
  owner_name: string;
  name: string;
  classe: string;
  level: number;
  exp_pct: number;
  regno: string;
  pvp: Pvp;
  gilda: { nome: string; ruolo: string };
  profile: Profile;
  corone: number;
  scellini: number;
  stats: StatRow[];
  item_bonus: Record<string, number>;
  equip: { difesa: number; difesaMagica: number; blocco: number };
  magia: { nucleo: number; talenti: number };
  resources: Resources;
  titles: Title[];
  skills: Skill[];
  active_skills: ActiveSkill[];
  talents: Talent[];
  inventory: InventoryItem[];
  pets: Pet[];
  curses: Curse[];
  quests: Quest[];
  reputation: Reputation[];
  combat: Combat;
  death?: Death | null;
  equipped: Partial<Record<SlotKey, string>>;
  item_previews: Record<string, ItemPreview>;
  derived: Derived[];
  totals: Record<string, number>;
  free_points: { total: number; used: number; left: number };
  power_rank: string;
  next_talent_level: number;
}

export interface CharacterSummary {
  id: number;
  owner_id: number;
  owner_name: string;
  name: string;
  classe: string;
  level: number;
  exp_pct: number;
  regno: string;
  pvp: Pvp;
  gilda: { nome: string; ruolo: string };
  power_rank: string;
  hp: number;
  hp_max: number;
}

export interface RarityDef { name: string; key: string; grade: number; weapon_base: [number, number | null]; creature_mult: number }
export interface ClassDef {
  id: string;
  name: string;
  skill: string;
  skill_text: string;
  cost: string;
  cooldown: number;
  equip: {
    name: string; type: string; weight: number; equip_type?: string | null; stats_text?: string; weapon_base?: number;
    stats?: Record<string, number>; bonus?: Record<string, number>; req?: Record<string, number>;
  }[];
}
export interface SlotDef { key: SlotKey; label: string; side: "left" | "right" | "bottom" }
export interface EquipTypeDef { key: string; label: string; slots: SlotKey[]; two_handed: boolean }
export interface KingdomDef { id: string; name: string; text: string }

export interface RulesConfig {
  creation: { base: number; bonus_points: number; min: number; name_min: number; name_max: number };
  level: { auto_per_level: number; free_per_level: number; talent_every: number };
  regen: { mp_pct: number; sp_pct: number };
  sources: { key: SourceKey; label: string; help: string }[];
  grades: string[];
  rarities: RarityDef[];
  classes: ClassDef[];
  kingdoms: KingdomDef[];
  positions: string[];
  power_ranks: { min: number; name: string }[];
  slots: SlotDef[];
  equip_types: EquipTypeDef[];
  equip_formula_keys: string[];
  item_categories: { key: ItemCategory; label: string }[];
}

export interface PreviewRequest {
  stats: StatRow[];
  item_bonus?: Record<string, number>;
  equip?: Character["equip"];
  magia?: Character["magia"];
  inventory?: InventoryItem[];
  /** Creazione guidata: aggiunge l'equipaggiamento iniziale della classe, indossato come alla creazione. */
  classe_id?: string;
}
export interface PreviewResponse {
  totals: Record<string, number>;
  derived: Derived[];
}

export interface CreateCharacterRequest {
  name: string;
  classe_id: string;
  stats: { STR: number; DEX: number; VIT: number; INT: number };
  regno_id: string;
  owner_id?: number;
}

export type CombatActionType = "damage" | "heal" | "spend_mp" | "spend_sp" | "spend_ki" | "restore_mp" | "restore_sp" | "restore_ki";

export interface NewEffect {
  name: string;
  kind: "good" | "bad";
  turns: number;
  text?: string;
  hpPerTurn?: number;
  absorb?: number;
}

export interface Campaign {
  id: number;
  name: string;
  session: number;
  master_name: string;
  open_quests: { name: string; who: string; rarity: string; due: string }[];
}

export type Trust = "Scarso" | "Neutrale" | "Buono" | "Eccellente";

export interface Npc {
  id: number;
  name: string;
  level: number;
  race: string;
  place: string;
  role: string;
  trust: Trust;
  knows: string;
  debts: string;
  last: string;
  secret: string;
  history: { session: number; text: string; at: string }[];
}

export interface Issue {
  id: number;
  title: string;
  text: string;
  sev: "bad" | "warn";
  resolved: boolean;
  decision: string | null;
}

/* ---------- Tavolo: tiri d100 e richieste del Master (/api/table) ---------- */
export type RollModKind = "Skill" | "Skill attiva" | "Titolo" | "Talento" | "Fortuna";
/** Allegato a un tiro: modificatore intero tra −999 e 999, `name` presente nella scheda del PG. */
export interface RollMod { kind: RollModKind; name: string; mod: number; text: string }
/** Dichiarazione prima del tiro: "sopra" (critico 91–99, supercritico 100) o "sotto" (critico 2–9, supercritico 1). */
export type RollCall = "sopra" | "sotto";
/** Critico calcolato dal server sul naturale e sulla dichiarazione; null = nessun critico. */
export type RollCrit = "critico" | "supercritico" | null;
/** Tiro d100 generato dal server: decine 0–9 (00–90), unità 0–9, naturale 1–100 (00 + 0 = 100). */
export interface Roll {
  id: number;
  char_id: number | null;
  char_name: string;
  by: "giocatore" | "master";
  author_id: number;
  author_name: string;
  reason: string;
  tens: number;
  units: number;
  natural: number;
  mods: RollMod[];
  total: number;
  /** null solo per i tiri del Master senza dichiarazione (e per i tiri di prima dei critici). */
  call: RollCall | null;
  crit: RollCrit;
  secret: boolean;
  request_id: number | null;
  created_at: string;
}
export type RollRequestStatus = "aperta" | "risolta";
export interface RollRequest {
  id: number;
  char_id: number;
  char_name: string;
  what: string;
  note: string;
  status: RollRequestStatus;
  roll_id: number | null;
  roll_total: number | null;
  roll_natural: number | null;
  roll_crit: RollCrit;
  created_at: string;
}
export interface CharRollRequest { call: RollCall; reason?: string; mods?: RollMod[]; request_id?: number | null }
