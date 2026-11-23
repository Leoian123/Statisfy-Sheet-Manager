// Riepilogo compatto della meccanica, calcolato nel client (senza chiamare il server): serve alla scheda,
// dove il vocabolario completo non c'è (solo il Master lo riceve da /forge/meta).
import type { Mech, MechEffect, MechEvent, MechOp } from "../../api/mech";

export const OP_SHORT: Record<MechOp, string> = {
  danno: "Danno", cura: "Cura", danno_e_cura: "Furto di vita", scudo: "Scudo", status_applica: "Applica status",
  status_rimuovi: "Rimuove status", status_consuma: "Consuma status", stat_mod: "Statistica", evoca: "Evocazione",
  sposta: "Sposta", interrompi: "Interrompe", reindirizza: "Reindirizza", dispel: "Dissolve", risorsa: "Risorse",
  ruba_buff: "Ruba buff", cd_mod: "Cooldown", turno_mod: "Turni", copia: "Copia", trasforma: "Trasformazione",
  campo: "Campo", esegui_sotto: "Esecuzione", resuscita: "Resurrezione", salvavita: "Salvavita", legame: "Legame",
  riflesso: "Riflesso", doma: "Doma", rivela: "Rivela", narrativo: "Testo",
};

export const EVENT_SHORT: Record<MechEvent, string> = {
  al_lancio: "al lancio", inizio_turno: "a inizio turno", fine_turno: "a fine turno", quando_colpito: "quando colpito",
  quando_colpisce: "quando colpisce", uccide: "all'uccisione", muore: "alla morte", morte_alleato: "alla morte di un alleato",
  azione_nemica: "quando un nemico agisce", dopo_abilita: "dopo un'abilità", soglia_hp: "sotto soglia di vita", passivo: "sempre",
};

const SIDE_SHORT: Record<string, string> = { se: "sé", alleato: "alleato", nemico: "nemico", qualsiasi: "chiunque" };
const SHAPE_SHORT: Record<string, string> = { singolo: "", area: "area", catena: "catena", casuale: "casuali", tutti: "tutti" };

/** Una riga per effetto, es. «Danno · nemico · area (al lancio)». */
export function effectLine(e: MechEffect): string {
  const op = OP_SHORT[e.azione?.op] ?? String(e.azione?.op ?? "?");
  const st = e.azione?.status ? ` ${e.azione.status}` : "";
  const b = e.bersaglio ?? { lato: "nemico", forma: "singolo" };
  const who = [SIDE_SHORT[b.lato] ?? b.lato, SHAPE_SHORT[b.forma] ?? b.forma].filter(Boolean).join(" ");
  const ev = e.trigger?.evento && e.trigger.evento !== "al_lancio" ? ` (${EVENT_SHORT[e.trigger.evento] ?? e.trigger.evento})` : "";
  const kids = e.figli?.length ? ` → ${e.figli.map(effectLine).join("; ")}` : "";
  return `${op}${st} · ${who}${ev}${kids}`;
}

/** Etichette brevi degli effetti (senza ripetizioni) e righe per il tooltip. */
export function mechSummary(m: Mech | null | undefined): { short: string; lines: string[] } {
  if (!m || !Array.isArray(m.effetti)) return { short: "", lines: [] };
  const ops = Array.from(new Set(m.effetti.map((e) => OP_SHORT[e.azione?.op] ?? String(e.azione?.op ?? ""))));
  const lines = m.effetti.map(effectLine);
  if (m.etichette?.length) lines.push(`Etichette: ${m.etichette.join(", ")}`);
  return { short: ops.join(" · ") || (m.tipo === "passiva" ? "Passiva" : "Nessun effetto"), lines };
}
