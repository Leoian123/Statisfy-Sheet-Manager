/* Richieste al Master: funzioni pure della pagina (ordine, stato "da leggere", testi delle date, mosse del Master).
   Testate in tests/richieste.test.ts. Solo `import type`: il client HTTP non va caricato nei test. */
import type { PlayerTicketKind, Ticket, TicketKind, TicketList, TicketStatus } from "../api/tickets";

export const KIND_SHORT: Record<TicketKind, string> = {
  funzione: "Funzione", contenuto: "Contenuto", regola: "Regola", evoluzione: "Evoluzione", comunicazione: "Dal Master",
};
export const KIND_HINTS: Record<TicketKind, string> = {
  funzione: "Un'idea per l'app: una schermata, un pulsante, un automatismo.",
  contenuto: "Oggetti, mostri, classi, missioni o luoghi da aggiungere al gioco.",
  regola: "Un dubbio sul regolamento: il Master risponde e può fissarlo nelle regole.",
  evoluzione: "Una skill ha raggiunto il Grado X: il Master definisce la passiva e il nuovo ciclo.",
  comunicazione: "Messaggio del Master: rispondi con un messaggio.",
};
export const KIND_ORDER: PlayerTicketKind[] = ["funzione", "contenuto", "regola"];
/** Filtro del Master: anche le richieste aperte dal sistema. */
export const KIND_FILTER: TicketKind[] = ["funzione", "contenuto", "regola", "evoluzione", "comunicazione"];
/** Aperte dal sistema: non si risolvono a mano (l'evoluzione si chiude con «Definisci evoluzione»). */
export function isSystemKind(k: TicketKind): boolean {
  return k === "evoluzione" || k === "comunicazione";
}
/** Colore del chip di stato (classi .chip del tema). */
export const STATUS_TONE: Record<TicketStatus, string> = {
  aperta: "gold", in_esame: "violet", risolta: "good", respinta: "bad", ritirata: "muted",
};

const DAY = 86_400_000;

export function isClosed(s: TicketStatus): boolean {
  return s === "risolta" || s === "respinta" || s === "ritirata";
}

function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return Date.parse(iso);
}

/** "12 nov" (con l'anno se diverso da quello di `now`). */
export function dayText(iso: string, now: number = Date.now()): string {
  const t = ms(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString("it-IT", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** Età compatta: "adesso", "5 min fa", "3 h fa", "ieri", "4 g fa", oltre le due settimane la data. */
export function ageText(iso: string, now: number = Date.now()): string {
  const t = ms(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h fa`;
  const g = Math.floor(diff / DAY);
  if (g === 1) return "ieri";
  if (g < 14) return `${g} g fa`;
  return dayText(iso, now);
}

/** "va in archivio il 28 nov (tra 5 giorni)"; null se non è prevista l'archiviazione. */
export function archiveText(archiveAt: string | null, now: number = Date.now()): string | null {
  const t = ms(archiveAt);
  if (!archiveAt || !Number.isFinite(t)) return null;
  const days = Math.ceil((t - now) / DAY);
  if (days <= 0) return "va in archivio al prossimo aggiornamento";
  const when = `il ${dayText(archiveAt, now)}`;
  return days === 1 ? `va in archivio ${when} (domani)` : `va in archivio ${when} (tra ${days} giorni)`;
}

/** L'autore corregge titolo e testo solo finché la richiesta è aperta (e non in archivio). */
export function canEdit(t: Ticket): boolean {
  return t.mine && !isSystemKind(t.kind) && t.status === "aperta" && !t.archived_at;
}
/** L'autore la ritira finché non è chiusa. */
export function canWithdraw(t: Ticket): boolean {
  return t.mine && !isSystemKind(t.kind) && (t.status === "aperta" || t.status === "in_esame") && !t.archived_at;
}

export interface Move { to: TicketStatus; label: string; primary?: boolean; danger?: boolean; needsAnswer: boolean }

/** Pulsanti di stato del Master per lo stato attuale. Chiudere (Risolvi / Respingi) richiede la risposta. */
export function masterMoves(s: TicketStatus): Move[] {
  const resolve: Move = { to: "risolta", label: "Risolvi", primary: true, needsAnswer: true };
  const reject: Move = { to: "respinta", label: "Respingi", danger: true, needsAnswer: true };
  if (s === "aperta") return [{ to: "in_esame", label: "Prendi in esame", needsAnswer: false }, resolve, reject];
  if (s === "in_esame") return [resolve, reject];
  if (s === "risolta" || s === "respinta") return [{ to: "in_esame", label: "Riapri", needsAnswer: false }];
  return [];
}

/** Il Master non ha un "letto" sul server: la richiesta chiede attenzione se è nuova o se l'ultimo messaggio è
 *  del giocatore, a meno che il Master non l'abbia già vista in questa versione (`seenAt` = updated_at visto). */
export function masterUnread(t: Ticket, seenAt: string | undefined): boolean {
  if (t.archived_at) return false;
  if (t.kind === "comunicazione") {  // scritta dal Master: chiede attenzione solo se il giocatore ha risposto
    const last = t.messages[t.messages.length - 1];
    return !!last && last.role !== "master" && !isClosed(t.status) && !(seenAt && ms(t.updated_at) <= ms(seenAt));
  }
  if (seenAt && ms(t.updated_at) <= ms(seenAt)) return false;
  if (t.status === "aperta") return true;
  const last = t.messages[t.messages.length - 1];
  return !!last && last.role !== "master" && !isClosed(t.status);
}

export function isUnread(t: Ticket, role: "master" | "giocatore", seen: Record<string, string>): boolean {
  return role === "master" ? masterUnread(t, seen[String(t.id)]) : t.unread;
}

/** Prima quelle da leggere, poi dalla più recente. Non muta l'array. */
export function sortTickets(items: Ticket[], role: "master" | "giocatore", seen: Record<string, string> = {}): Ticket[] {
  return items
    .map((t) => ({ t, u: isUnread(t, role, seen), at: ms(t.updated_at) || 0 }))
    .sort((a, b) => Number(b.u) - Number(a.u) || b.at - a.at || b.t.id - a.t.id)
    .map((x) => x.t);
}

/** Totale delle richieste non in archivio (tutti gli stati). */
export function activeTotal(counts: TicketList["counts"]): number {
  return counts.aperta + counts.in_esame + counts.risolta + counts.respinta + counts.ritirata;
}

/** Controllo locale prima di inviare (il server rifà gli stessi controlli). */
export function newTicketError(title: string, body: string, limits: { title: number; body: number }): string | null {
  const t = title.split(/\s+/).filter(Boolean).join(" ");
  if (t.length < 3) return "Scrivi un titolo di almeno 3 caratteri.";
  if (t.length > limits.title) return `Titolo troppo lungo (massimo ${limits.title} caratteri).`;
  if (!body.trim()) return "Scrivi il testo della richiesta.";
  if (body.length > limits.body) return `Testo troppo lungo (massimo ${limits.body} caratteri).`;
  return null;
}

/** Mappa "vista dal Master" ripulita: scarta le voci non valide e tiene solo le `max` richieste più recenti (id più alti). */
export function pruneSeen(seen: unknown, max = 300): Record<string, string> {
  if (!seen || typeof seen !== "object" || Array.isArray(seen)) return {};
  const ok = Object.entries(seen as Record<string, unknown>)
    .filter((e): e is [string, string] => /^\d+$/.test(e[0]) && typeof e[1] === "string")
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, max);
  return Object.fromEntries(ok);
}
