// API delle Richieste al Master (/api/tickets): proposte di funzioni e contenuti, domande sul regolamento.
import { request } from "./client";

export type TicketKind = "funzione" | "contenuto" | "regola";
export type TicketStatus = "aperta" | "in_esame" | "risolta" | "respinta" | "ritirata";
export const KIND_LABELS: Record<TicketKind, string> = { funzione: "Nuova funzione", contenuto: "Nuovo contenuto", regola: "Domanda sul regolamento" };
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
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  archived_at: string | null;
  /** Quando andrà in archivio (solo per le chiuse non ancora archiviate). */
  archive_at: string | null;
  version: number;
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
  create: (d: { kind: TicketKind; title: string; body: string; char_id?: number | null }) => changed(request<Ticket>("POST", "/tickets", d)),
  message: (n: number, text: string) => changed(request<Ticket>("POST", `/tickets/${id(n)}/messages`, { text })),
  update: (n: number, patch: TicketPatch) => changed(request<Ticket>("PATCH", `/tickets/${id(n)}`, patch)),
  archive: (n: number) => changed(request<Ticket>("POST", `/tickets/${id(n)}/archive`)),
  rotate: () => changed(request<{ archived: number; archive_days: number }>("POST", "/tickets/rotate")),
};
