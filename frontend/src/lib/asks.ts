/* Richieste di tiro rapide della Plancia del Master. Funzione pura: testata in tests/asks.test.ts. */

/** Richieste comuni che completano quelle usate di recente. */
export const COMMON_ASKS = ["Percezione", "Iniziativa", "Furtività", "Agilità", "Resistenza", "Volontà"];

/** Le ultime richieste usate (dalla più recente, senza doppioni anche di maiuscole), completate con le comuni. Al massimo `max`. */
export function quickAsks(reqs: { id: number; what: string }[], max = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const recent = reqs.slice().sort((a, b) => b.id - a.id).map((q) => q.what.trim());
  for (const w of [...recent, ...COMMON_ASKS]) {
    if (out.length >= max) break;
    const k = w.toLowerCase();
    if (w && !seen.has(k)) { seen.add(k); out.push(w); }
  }
  return out;
}
