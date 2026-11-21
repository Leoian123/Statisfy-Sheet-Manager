/* Diario dell'avventuriero: funzioni pure della pagina (raggruppamento per sessione, tag, allegati scelti, filtri
   dei candidati, prefill da URL). Testate in tests/diario.test.ts. Nessuna regola qui: le valida il server. */
import type { AttachableItem, AttachKind, JournalAttachment, JournalEntry } from "../api/journal.ts";

/** Limiti del server (stessi di JOURNAL_LIMITS in api/journal.ts, ripetuti per non importare il client HTTP nei test). */
export const LIMITS = { title: 120, body: 20000, tags: 8, tag: 24, attachments: 12 };
export const KINDS: AttachKind[] = ["roll", "item", "title", "skill", "talent", "quest"];
/** Tipi che richiedono il personaggio della pagina (sul server si cercano nella sua scheda). */
export const NEEDS_CHAR: ReadonlySet<AttachKind> = new Set<AttachKind>(["item", "title", "skill", "talent"]);
export const KIND_ICON: Record<AttachKind, string> = { roll: "d%", item: "◈", title: "✦", skill: "⚔", talent: "❖", quest: "!" };
export const KIND_ONE: Record<AttachKind, string> = { roll: "Tiro", item: "Oggetto", title: "Titolo", skill: "Skill", talent: "Talento", quest: "Quest" };

/** Allegato scelto nel compositore: {kind, ref} per il server più etichetta e dettagli solo per mostrarlo. */
export interface Picked { kind: AttachKind; ref: string; label: string; detail: string; rarity: string | null }

export const pickKey = (a: { kind: AttachKind; ref: string }) => `${a.kind}:${a.ref.trim().toLowerCase()}`;

/** Normalizza un tag come il server: niente caratteri di controllo, spazi compressi, minuscolo, max 24 caratteri. */
export function normTag(t: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = String(t).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  return clean.split(/\s+/).filter(Boolean).join(" ").toLowerCase().slice(0, LIMITS.tag).trim();
}

/** Aggiunge i tag scritti (separati da virgola) a quelli presenti: niente doppioni, al massimo 8. */
export function addTags(current: string[], raw: string): string[] {
  const out = [...current];
  for (const part of raw.split(",")) {
    const t = normTag(part);
    if (t && !out.includes(t) && out.length < LIMITS.tags) out.push(t);
  }
  return out;
}

export interface EntryGroup { key: string; title: string; items: JournalEntry[] }

/** Timeline: prima le pagine fissate, poi una sezione per sessione nell'ordine in cui arrivano (dalla più recente). */
export function groupBySession(items: JournalEntry[]): EntryGroup[] {
  const pinned = items.filter((e) => e.pinned);
  const groups: EntryGroup[] = pinned.length ? [{ key: "pinned", title: "Fissate", items: pinned }] : [];
  const bySession = new Map<number, EntryGroup>();
  for (const e of items) {
    if (e.pinned) continue;
    let g = bySession.get(e.session);
    if (!g) {
      g = { key: `s${e.session}`, title: `Sessione ${e.session}`, items: [] };
      bySession.set(e.session, g);
    }
    g.items.push(e);
  }
  return [...groups, ...[...bySession.values()].sort((a, b) => Number(b.key.slice(1)) - Number(a.key.slice(1)))];
}

/** Unisce una nuova pagina di risultati a quelle già caricate senza doppioni (se nel frattempo ne è stata aggiunta una). */
export function mergePage(have: JournalEntry[], more: JournalEntry[]): JournalEntry[] {
  const ids = new Set(have.map((e) => e.id));
  return [...have, ...more.filter((e) => !ids.has(e.id))];
}

/** Testo lungo: si mostra accorciato con "Leggi tutto". */
export function isLong(body: string, chars = 320, lines = 6): boolean {
  return body.length > chars || body.split("\n").length > lines;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Candidati di un tipo filtrati per testo (etichetta o dettagli, senza accenti). */
export function filterCandidates(list: AttachableItem[], q: string): AttachableItem[] {
  const n = fold(q.trim());
  if (!n) return list;
  return list.filter((x) => fold(`${x.label} ${x.detail || ""}`).includes(n));
}

/** Allegati scelti → quelli da mandare al server. */
export const toRefs = (p: Picked[]) => p.map(({ kind, ref }) => ({ kind, ref }));

/** Istantanee salvate → allegati scelti (per modificare una pagina). */
export const fromSnapshots = (a: JournalAttachment[]): Picked[] =>
  a.map((x) => ({ kind: x.kind, ref: x.ref, label: x.label, detail: x.detail, rarity: x.rarity ?? null }));

/** Cambiando personaggio restano solo i tiri e le quest: oggetti, titoli, skill e talenti erano della scheda precedente. */
export function pruneForChar(p: Picked[], charId: number | null, prev: number | null): Picked[] {
  if (charId === prev) return p;
  return p.filter((x) => !NEEDS_CHAR.has(x.kind));
}

/** Stessi allegati nello stesso ordine (per non rimandarli al server se non sono cambiati). */
export function samePicks(a: Picked[], b: Picked[]): boolean {
  return a.length === b.length && a.every((x, i) => pickKey(x) === pickKey(b[i]));
}

/** Aggiunge o toglie un allegato (al massimo 12). Ritorna null se si è al limite. */
export function togglePick(p: Picked[], c: Picked): Picked[] | null {
  const k = pickKey(c);
  if (p.some((x) => pickKey(x) === k)) return p.filter((x) => pickKey(x) !== k);
  if (p.length >= LIMITS.attachments) return null;
  return [...p, c];
}

/** Parametri ?char=&roll= di "Annota nel diario": solo interi positivi, altrimenti ignorati. */
export function prefillFromQuery(params: URLSearchParams): { charId: number | null; rollId: string | null } {
  const int = (v: string | null) => (v && /^\d{1,15}$/.test(v) && Number(v) > 0 ? v : null);
  const c = int(params.get("char"));
  return { charId: c ? Number(c) : null, rollId: int(params.get("roll")) };
}

/** Data breve in italiano (es. "21/11/26, 18:40"); stringa vuota se non valida. */
export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}
