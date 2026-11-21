// API del Diario dell'avventuriero (/api/journal). Gli allegati li risolve il server: si mandano solo {kind, ref}.
import { request } from "./client";

export type JournalVisibility = "privato" | "gruppo";
export type AttachKind = "roll" | "item" | "title" | "skill" | "talent" | "quest";
export const ATTACH_LABELS: Record<AttachKind, string> = {
  roll: "Tiri", item: "Oggetti", title: "Titoli", skill: "Skill", talent: "Talenti", quest: "Quest",
};

/** Allegato salvato: istantanea al momento dell'allegato (resta leggibile anche se l'elemento cambia). */
export interface JournalAttachment { kind: AttachKind; ref: string; label: string; detail: string; rarity: string | null; at?: string }
export interface JournalEntry {
  id: number;
  author_id: number;
  author_name: string;
  mine: boolean;
  char_id: number | null;
  char_name: string | null;
  title: string;
  /** Testo semplice: va mostrato come testo (mai come HTML). */
  body: string;
  tags: string[];
  attachments: JournalAttachment[];
  visibility: JournalVisibility;
  pinned: boolean;
  session: number;
  created_at: string;
  updated_at: string;
  version: number;
}
export interface JournalList { total: number; tags: string[]; items: JournalEntry[] }
export interface AttachableItem { ref: string; label: string; detail: string; rarity?: string | null; at?: string }
export type Attachables = Record<AttachKind, AttachableItem[]>;

export interface EntryDraft {
  title: string;
  body: string;
  tags: string[];
  char_id: number | null;
  visibility: JournalVisibility;
  pinned: boolean;
  attachments: { kind: AttachKind; ref: string }[];
}
export interface JournalQuery { scope?: "tutto" | "miei" | "gruppo"; char_id?: number; tag?: string; q?: string; limit?: number; offset?: number }

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Limiti del server (validati anche lì). */
export const JOURNAL_LIMITS = { title: 120, body: 20000, tags: 8, tag: 24, attachments: 12 };

export const journalApi = {
  list: (q: JournalQuery = {}) => request<JournalList>("GET", `/journal${qs({ ...q })}`),
  get: (id: number) => request<JournalEntry>("GET", `/journal/${encodeURIComponent(id)}`),
  attachables: (charId: number | null) => request<Attachables>("GET", `/journal/attachables${qs({ char_id: charId ?? undefined })}`),
  create: (d: EntryDraft) => request<JournalEntry>("POST", "/journal", d),
  /** `version` = versione letta: se un'altra sessione l'ha cambiata nel frattempo il server risponde 409. */
  update: (id: number, patch: Partial<EntryDraft> & { version?: number }) => request<JournalEntry>("PATCH", `/journal/${encodeURIComponent(id)}`, patch),
  remove: (id: number) => request<void>("DELETE", `/journal/${encodeURIComponent(id)}`),
};
