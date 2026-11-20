// API della Forgia del Master (/api/forge, solo Master). Le regole e i calcoli sono tutti nel backend:
// il frontend tiene la bozza del wizard e chiede al server validazione per passo e valori dell'anteprima.
import { request } from "./client";

export type ForgeKind = "skills" | "classes" | "races" | "titles" | "npcs" | "encounters" | "spells" | "miracles" | "items";
export type ExpMode = "intera" | "divisa";
/** Bozza libera di un wizard (campi del modulo). */
export type Draft = Record<string, any>;
export type Computed = Record<string, any>;

export interface Opt { v: string; l: string; sub?: string }
export interface ForgeRarity { name: string; key: string; grade: number; creature_mult: number; weapon_base: [number, number | null] }
export interface ForgeChar { id: number; name: string; level: number; classe: string; exp_pct: number }
export interface Sphere { key: string; it: string; field: string; pure?: boolean }
export interface God { key: string; name: string; domain: "Luce" | "Ombra"; origin?: boolean; epithet: string; sphere: string; tone: string; affine: string[]; vows: string[] }

export interface ForgeMeta {
  stats: { code: string; name: string }[];
  skill_types: string[];
  acquire: Opt[];
  grade1_rule: Record<string, string>;
  weapon_grade_rows: { what: string; unit: string; vals: number[] }[];
  class_types: Opt[];
  talent_levels: number[];
  race_templates: { name: string; origin: string; desc: string; rel?: { race: string; rel: string }[] }[];
  race_origins_extra: string[];
  relations: string[];
  races_known: string[];
  title_acq: Record<string, string>;
  title_examples: Record<string, string>;
  title_effects: string[];
  trust: string[];
  sizes: { v: string; m: number }[];
  environments: string[];
  difficulty: { max: number | null; label: string; tone: string }[];
  drop_kinds: { name: string; text: string; up: number; same: number; down: number }[];
  exp_modes: ExpMode[];
  spheres: Sphere[];
  spell_roles: string[];
  spell_categories: { key: string; name: string }[];
  spell_origins: { key: string; name: string; text: string; skill: boolean }[];
  compat_notes: Record<string, string>;
  metamagic: { key: string; name: string; en: string; lv: number; text: string }[];
  sphere_meta: Record<string, { name: string; text: string }>;
  sphere_meta_lv: number;
  zones: { key: string; name: string; plus?: string; minus?: string }[];
  ley_lines: { v: number; name: string; surge: number }[];
  backlash_bands: { max: number | null; name: string; tone: string; text: string }[];
  gods: God[];
  natures: { key: string; name: string; text: string; base?: [number, number] }[];
  favor: { v: number; name: string }[];
  against: { key: string; name: string; text: string; from_text?: boolean }[];
  spell_max_level: number;
  combo_grade: number;
  kinds: { key: ForgeKind; label: string }[];
  steps: Record<ForgeKind, string[]>;
  rarities: ForgeRarity[];
  roman: string[];
  grades: string[];
  stat_codes: string[];
  characters: ForgeChar[];
  library_skills: { name: string; type: string; mode: string }[];
  known_titles: { name: string; rarity: string }[];
  classes: string[];
  races: string[];
  kingdoms: string[];
  session: number;
  item_bonus: { v: string; l: string }[];
  equip_types: { key: string; label: string; slots: string[]; two_handed: boolean }[];
  assignable: ForgeKind[];
}

export interface ForgePreview { kind: ForgeKind; steps: string[]; first_bad: number; computed: Computed }

export interface EncounterClosed {
  mode: ExpMode; at: string; session: number; text: string;
  results: ExpRow[];
}
export interface ForgeEntry {
  id: number; kind: ForgeKind; name: string; summary: string; data: Draft;
  assigned_to: number | null; assigned_name: string | null; npc_id: number | null;
  closed: EncounterClosed | null; session: number; created_at: string;
}
export interface DropRow { from: number; to: number; what: string; rarity: string }
export interface DropProfile {
  kind: string; text: string; top: string; rows: DropRow[]; rolls: number; corone: number; scellini: number;
  mats: { name: string; qty: number; rarity: string }[];
}
export interface ExpRow {
  id: number; name: string; level: number; exp_pct: number; full: number; pct: number;
  after_level: number; after_exp: number; ups: number;
}

export interface AssignPreview {
  error: string; issues: string[]; replaces: string | null; unmet: string[];
  lines: { code: string; missing: boolean; delta: number; before?: number; after?: number; total_before?: number; total_after?: number }[];
}
export interface BoardPc {
  id: number; name: string; classe: string; owner_name: string; level: number; exp_pct: number; power_rank: string;
  resources: Record<string, number>; maxes: Record<string, number>; dead: boolean;
  effects: { name: string; kind: "good" | "bad"; turns: number }[];
}
export interface LiveCreature { name: string; count: number; rarity: string; level: number; max: number; hp: number }
export interface BoardEncounter extends ForgeEntry { live: { active?: boolean; turn?: number; hp?: number[] }; creatures: LiveCreature[] }
export interface Board {
  campaign: { name: string; session: number; master_name: string; open_quests: { name: string; who: string; rarity: string; due: string }[] } | null;
  party: BoardPc[];
  npcs: { id: number; name: string; level: number; role: string; place: string; trust: string; last: string }[];
  encounters: BoardEncounter[];
  active_encounter_id: number | null;
  library: ForgeEntry[];
  counts: Record<ForgeKind, number>;
  log: { at: string; text: string; entry_id: number; kind: ForgeKind }[];
}
export type LiveAction = "start" | "stop" | "next_turn" | "damage" | "heal";

const enc = encodeURIComponent;

export const forgeApi = {
  meta: () => request<ForgeMeta>("GET", "/forge/meta"),
  library: () => request<ForgeEntry[]>("GET", "/forge/library"),
  preview: (kind: ForgeKind, draft: Draft) => request<ForgePreview>("POST", "/forge/preview", { kind, draft }),
  save: (kind: ForgeKind, draft: Draft) => request<{ entry: ForgeEntry; messages: string[] }>("POST", "/forge/entries", { kind, draft }),
  remove: (id: number) => request<void>("DELETE", `/forge/entries/${enc(id)}`),
  dropProfile: (creatures: Draft[]) => request<DropProfile>("POST", "/forge/drop-profile", { creatures }),
  dropRoll: (profile: DropProfile) => request<{ rolls: { d100: number; what: string; rarity: string }[]; text: string }>("POST", "/forge/drop-roll", { profile }),
  encounterExp: (id: number, mode: ExpMode) => request<{ mode: ExpMode; party: number; rows: ExpRow[] }>("GET", `/forge/encounters/${enc(id)}/exp?mode=${enc(mode)}`),
  board: () => request<Board>("GET", "/forge/board"),
  assignPreview: (id: number, charId: number) => request<AssignPreview>("GET", `/forge/entries/${enc(id)}/assign-preview?char_id=${enc(charId)}`),
  assign: (id: number, charId: number, force = false) =>
    request<{ entry: ForgeEntry; messages: string[] }>("POST", `/forge/entries/${enc(id)}/assign`, { char_id: charId, force }),
  live: (id: number, action: LiveAction, index?: number, amount?: number) =>
    request<{ entry: ForgeEntry; message: string }>("POST", `/forge/encounters/${enc(id)}/live`, { action, index, amount }),
  closeEncounter: (id: number, mode: ExpMode) =>
    request<{ entry: ForgeEntry; results: ExpRow[]; messages: string[] }>("POST", `/forge/encounters/${enc(id)}/close`, { mode }),
};
