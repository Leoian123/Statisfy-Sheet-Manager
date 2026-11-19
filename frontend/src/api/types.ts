// Tipi del contratto API v1 (docs/API.md). Il frontend non calcola regole: mostra ciò che riceve.

export type Role = "master" | "player";

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export type SourceKey = "iniziale" | "creazione" | "investiti" | "levelup" | "altro" | "titoli";
export const SOURCE_KEYS: SourceKey[] = ["iniziale", "creazione", "investiti", "levelup", "altro", "titoli"];

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

export interface Title { name: string; rarity: string; bonus: Record<string, number> }
export interface Skill { name: string; lvl: number; pct: number | "MAX"; type: string; passive?: string | null }
export interface ActiveSkill { name: string; effect: string; lvl: number; pct: number | "MAX"; cost: string; cd: number }
export interface Talent { name: string; rarity: string; origin: string; effect: string }
export interface InventoryItem { name: string; stats: string; rarity: string; type: string; qty: number; weight: number }
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
}

export interface Death {
  lost: number;
  malus: string;
  bonus: string;
  protected: boolean;
}

export interface Resources { hp: number; mp: number; sp: number }

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
  equip: { name: string; type: string; weight: number }[];
}
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
}

export interface PreviewRequest {
  stats: StatRow[];
  item_bonus?: Record<string, number>;
  equip?: Character["equip"];
  magia?: Character["magia"];
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

export type CombatActionType = "damage" | "heal" | "spend_mp" | "spend_sp";

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
