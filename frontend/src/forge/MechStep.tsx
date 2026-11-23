/* Forgia · passo «Meccanica». Incantesimo e Miracolo: obbligatorio, subito dopo il concetto (la meccanica dice che cosa
   fa l'abilità; sfere, livello, costo e ricarica vengono dopo e il server li aggiunge alla meccanica salvata).
   Skill: facoltativo e penultimo, senza `mech` resta descrittiva.
   Il riepilogo leggibile e gli errori arrivano dal server (computed.mech dell'anteprima). */
import type { Mech, MechCost } from "../api/mech";
import { MechEditor, type MechKindHint } from "../components/mech/MechEditor";
import { mechSummary } from "../components/mech/summary";
import { DASH, PvRow, Ref, useW, type WCtx } from "./engine";

const LAUNCH_RES = new Set(["MP", "SP", "KI", "HP", "FEDE"]);

/** Il server riempie il costo di lancio dal wizard solo se `costi` è vuoto: se il Master ha messo un costo
    per turno o in stack, aggiungiamo qui il costo di lancio calcolato dal wizard. */
function withLaunch(m: Mech | null, launch: { risorsa: MechCost["risorsa"]; valore: number } | null): Mech | null {
  if (!m || !launch || !(launch.valore > 0) || m.tipo === "passiva" || !m.costi?.length) return m;
  if (m.costi.some((c) => c.per !== "turno" && LAUNCH_RES.has(c.risorsa))) return m;
  return { ...m, costi: [{ risorsa: launch.risorsa, valore: launch.valore, per: "lancio" as const }, ...m.costi].slice(0, 4) };
}

export function MechStep({ kind, launch, required }: {
  kind: (x: WCtx) => MechKindHint;
  /** Solo per la Skill: il costo è già noto quando si arriva qui. Incantesimi e miracoli lo calcolano dopo (lo aggiunge il server). */
  launch?: (x: WCtx) => { risorsa: MechCost["risorsa"]; valore: number } | null;
  required?: boolean;
}) {
  const x = useW();
  const vocab = x.meta.mech;
  if (!vocab) {
    return <Ref>La meccanica strutturata non è disponibile in questa modalità.{required ? "" : " L'abilità resta descrittiva: il passo è facoltativo."}</Ref>;
  }
  const cm = x.c.mech as { text: string; errors: string[] } | null | undefined;
  return (
    <MechEditor value={(x.d.mech as Mech | null | undefined) ?? null} vocab={vocab} kindHint={kind(x)} lockKind stripTemplateCosts required={required}
      statKeys={x.meta.stat_codes} text={cm?.text || undefined} errors={cm?.errors}
      onChange={(m) => x.set("mech", launch ? withLaunch(m, launch(x)) : m)} />
  );
}

/** Riga «Meccanica» dell'anteprima: azioni in breve, descrizione completa (con costo e ricarica) nel tooltip. */
export function PvMech() {
  const { d, c } = useW();
  const m = d.mech as Mech | null | undefined;
  const cm = c.mech as { text: string; errors: string[] } | null | undefined;
  const s = mechSummary(m);
  return (
    <PvRow label="Meccanica" tip={cm?.errors?.length ? cm.errors : cm?.text || s.lines}>
      {m ? <span className={cm?.errors?.length ? "wz-bad" : ""}>{s.short}</span> : DASH}
    </PvRow>
  );
}
