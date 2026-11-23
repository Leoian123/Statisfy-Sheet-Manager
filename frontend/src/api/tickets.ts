// API delle Richieste al Master (/api/tickets): proposte di funzioni e contenuti, domande sul regolamento.
import { request } from "./client";

/** Tipi che un giocatore apre; "evoluzione" e "comunicazione" le apre il sistema (skill al Grado X). */
export type PlayerTicketKind = "funzione" | "contenuto" | "regola";
export type TicketKind = PlayerTicketKind | "evoluzione" | "comunicazione";
export type TicketStatus = "aperta" | "in_esame" | "risolta" | "respinta" | "ritirata";
export const KIND_LABELS: Record<TicketKind, string> = {
  funzione: "Nuova funzione", contenuto: "Nuovo contenuto", regola: "Domanda sul regolamento",
  evoluzione: "Evoluzione di una skill", comunicazione: "Dal Master",
};
export const STATUS_LABELS: Record<TicketStatus, string> = {
  aperta: "Aperta", in_esame: "In esame", risolta: "Risolta", respinta: "Respinta", ritirata: "Ritirata",
};
export const ACTIVE_STATUSES: TicketStatus[] = ["aperta", "in_esame"];
export const CLOSED_STATUSES: TicketStatus[] = ["risolta", "respinta", "ritirata"];

export interface TicketMessage { by: number; by_name: string; role: "master" | "player"; text: string; at: string }
export interface Ticket {
  id: number;
  author_id: number;
  author_name: string;
  mine: boolean;
  char_id: number | null;
  char_name: string | null;
  kind: TicketKind;
  title: string;
  /** Testo semplice: va mostrato come testo (mai come HTML). */
  body: string;
  status: TicketStatus;
  /** Risposta o decisione del Master. */
  answer: string;
  messages: TicketMessage[];
  /** Questione delle regole creata da questa domanda (Area Master), se promossa. */
  issue_id: number | null;
  /** Vero per l'autore quando il Master ha risposto/cambiato stato e lui non l'ha ancora aperta. */
  unread: boolean;
  /** Comunicazione del Master: a chi è indirizzata (to_me = a chi la sta leggendo). */
  recipient_id?: number | null;
  recipient_name?: string | null;
  to_me?: boolean;
  /** Dati di sistema: evoluzione {field, skill, ciclo, role, pair}. */
  meta?: EvolutionMeta | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  archived_at: string | null;
  /** Quando andrà in archivio (solo per le chiuse non ancora archiviate). */
  archive_at: string | null;
  version: number;
}
export interface EvolutionMeta { field: "skills" | "active_skills"; skill: string; ciclo: number; role: "master" | "giocatore"; pair?: number }
export interface EvolveBody {
  version?: number; passiva_nome?: string; passiva_effetto?: string; passiva_mech?: unknown | null;
  skill_mech?: unknown | null; togli_meccanica?: boolean; risposta?: string;
}
export interface TicketList {
  total: number;
  counts: Record<TicketStatus | "archivio", number>;
  archive_days: number;
  items: Ticket[];
}
export interface TicketQuery { scope?: "attive" | "archivio"; status?: TicketStatus; kind?: TicketKind; q?: string; limit?: number; offset?: number }
export interface TicketPatch { version?: number; status?: TicketStatus; answer?: string; title?: string; body?: string; promote_issue?: boolean }

/** Limiti del server (validati anche lì). */
export const TICKET_LIMITS = { title: 120, body: 5000, message: 2000 };

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const id = (n: number) => encodeURIComponent(n);

/** Evento per il contatore del menu: parte dopo ogni azione che può cambiare richieste nuove o non lette. */
export const TICKETS_CHANGED = "statisfy-tickets-changed";
async function changed<T>(p: Promise<T>): Promise<T> {
  const out = await p;
  try { window.dispatchEvent(new Event(TICKETS_CHANGED)); } catch { /* fuori dal browser (test) */ }
  return out;
}

export const ticketsApi = {
  summary: () => request<{ count: number }>("GET", "/tickets/summary"),
  list: (q: TicketQuery = {}) => request<TicketList>("GET", `/tickets${qs({ ...q })}`),
  /** Aprirla come autore la segna come letta. */
  get: (n: number) => changed(request<Ticket>("GET", `/tickets/${id(n)}`)),
  create: (d: { kind: PlayerTicketKind; title: string; body: string; char_id?: number | null }) => changed(request<Ticket>("POST", "/tickets", d)),
  message: (n: number, text: string) => changed(request<Ticket>("POST", `/tickets/${id(n)}/messages`, { text })),
  update: (n: number, patch: TicketPatch) => changed(request<Ticket>("PATCH", `/tickets/${id(n)}`, patch)),
  archive: (n: number) => changed(request<Ticket>("POST", `/tickets/${id(n)}/archive`)),
  /** Il Master definisce l'evoluzione: passiva nuova, meccanica facoltativa della skill, nuovo ciclo. */
  evolve: (n: number, body: EvolveBody) => changed(request<Ticket>("POST", `/tickets/${id(n)}/evoluzione`, body)),
  /** Il Master apre a mano l'evoluzione di una skill già al Grado X. */
  openEvolution: (charId: number, field: "skills" | "active_skills", name: string) =>
    changed(request<{ opened: number[] }>("POST", `/characters/${id(charId)}/evoluzione`, { field, name })),
  rotate: () => changed(request<{ archived: number; archive_days: number }>("POST", "/tickets/rotate")),
};
