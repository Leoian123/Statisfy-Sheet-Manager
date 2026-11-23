/* Forgia · passo «Meccanica» (penultimo) di Incantesimo, Miracolo e Skill. Facoltativo: senza `mech` l'abilità
   resta descrittiva. Il riepilogo leggibile e gli errori arrivano dal server (computed.mech dell'anteprima). */
import type { Mech, MechCost } from "../api/mech";
import { MechEditor, type MechKindHint } from "../components/mech/MechEditor";
import { Ref, useW, type WCtx } from "./engine";

const LAUNCH_RES = new Set(["MP", "SP", "KI", "HP", "FEDE"]);

/** Il server riempie il costo di lancio dal wizard solo se `costi` è vuoto: se il Master ha messo un costo
    per turno o in stack, aggiungiamo qui il costo di lancio calcolato dal wizard. */
function withLaunch(m: Mech | null, launch: { risorsa: MechCost["risorsa"]; valore: number } | null): Mech | null {
  if (!m || !launch || !(launch.valore > 0) || m.tipo === "passiva" || !m.costi?.length) return m;
  if (m.costi.some((c) => c.per !== "turno" && LAUNCH_RES.has(c.risorsa))) return m;
  return { ...m, costi: [{ risorsa: launch.risorsa, valore: launch.valore, per: "lancio" as const }, ...m.costi].slice(0, 4) };
}

export function MechStep({ kind, launch }: {
  kind: (x: WCtx) => MechKindHint;
  launch: (x: WCtx) => { risorsa: MechCost["risorsa"]; valore: number } | null;
}) {
  const x = useW();
  const vocab = x.meta.mech;
  if (!vocab) {
    return <Ref>La meccanica strutturata non è disponibile in questa modalità: l'abilità resta descrittiva. Il passo è facoltativo.</Ref>;
  }
  const cm = x.c.mech as { text: string; errors: string[] } | null | undefined;
  return (
    <MechEditor value={(x.d.mech as Mech | null | undefined) ?? null} vocab={vocab} kindHint={kind(x)} lockKind stripTemplateCosts
      statKeys={x.meta.stat_codes} text={cm?.text || undefined} errors={cm?.errors}
      onChange={(m) => x.set("mech", withLaunch(m, launch(x)))} />
  );
}
