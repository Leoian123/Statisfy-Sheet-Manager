/* Registro unico della Plancia di gioco: unisce tiri d100 e righe del combattimento, dal più recente.
   Le righe del combattimento hanno l'ora in `combat.log_at` (parallelo a `log` dalla fine); quelle vecchie senza ora
   vanno in fondo, nell'ordine in cui sono state scritte. Solo funzioni pure: testate in tests/register.test.ts. */
import type { Roll } from "../api/types";

export type RegisterFilter = "tutto" | "tiri" | "combattimento";

export type RegisterEntry =
  | { kind: "roll"; key: string; at: number; r: Roll }
  | { kind: "combat"; key: string; at: number; text: string; iso: string; seq: number };

interface CombatLog { log?: string[]; log_at?: string[] }

/** Righe del combattimento con l'ora (log_at è parallelo a log dalla fine). */
export function combatEntries(combat: CombatLog): RegisterEntry[] {
  const log = combat.log ?? [];
  const at = combat.log_at ?? [];
  const off = log.length - at.length;
  return log.map((text, i) => {
    const iso = i - off >= 0 ? at[i - off] || "" : "";
    const t = iso ? Date.parse(iso) : NaN;
    return { kind: "combat" as const, key: `c${i}-${text}`, at: Number.isFinite(t) ? t : -Infinity, text, iso, seq: i };
  });
}

/** Voci del registro filtrate e ordinate dalla più recente, con il conteggio per ogni filtro. */
export function registerEntries(rolls: Roll[], combat: CombatLog, filter: RegisterFilter) {
  const rollE: RegisterEntry[] = rolls.map((r) => ({ kind: "roll", key: `r${r.id}`, at: Date.parse(r.created_at), r }));
  const combE = combatEntries(combat);
  const list = filter === "tiri" ? rollE : filter === "combattimento" ? combE : [...rollE, ...combE];
  const seq = (e: RegisterEntry) => (e.kind === "combat" ? e.seq : 0);
  const sorted = list.slice().sort((a, b) => (b.at - a.at) || (seq(b) - seq(a)));
  return { sorted, counts: { tutto: rollE.length + combE.length, tiri: rollE.length, combattimento: combE.length } };
}

/** "T3 · Danno: …" → turno 3 e testo senza prefisso; righe senza prefisso → turno null. */
export function splitTurn(text: string): { turn: number | null; text: string } {
  const m = /^T(\d+) · (.*)$/s.exec(text);
  return m ? { turn: Number(m[1]), text: m[2] } : { turn: null, text };
}
