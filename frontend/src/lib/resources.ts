import type { Derived, ResourceKey } from "../api/types";

/** Risorse in ordine di visualizzazione. Il KI vale solo per chi ha la statistica avanzata KI. */
export const RESOURCE_DEFS: { key: ResourceKey; label: string; short: string }[] = [
  { key: "hp", label: "Vita (HP)", short: "HP" },
  { key: "mp", label: "Mana (MP)", short: "MP" },
  { key: "sp", label: "Stamina (SP)", short: "SP" },
  { key: "ki", label: "KI", short: "KI" },
];

/** Massimi delle risorse del PG, dalle derivate: `ki` c'è solo se il server calcola la derivata "ki". */
export function resourceMaxes(derived: Derived[] | Record<string, Derived>): Partial<Record<ResourceKey, number>> {
  const d = Array.isArray(derived) ? Object.fromEntries(derived.map((x) => [x.key, x])) : derived;
  const out: Partial<Record<ResourceKey, number>> = {};
  for (const r of RESOURCE_DEFS) {
    if (d[r.key]) out[r.key] = d[r.key].value;
    else if (r.key !== "ki") out[r.key] = 0;
  }
  return out;
}

/** Risorse che valgono per il PG (HP, MP, SP e KI se c'è), con massimo. */
export function resourcesFor(derived: Derived[] | Record<string, Derived>) {
  const max = resourceMaxes(derived);
  return RESOURCE_DEFS.filter((r) => max[r.key] != null).map((r) => ({ ...r, max: max[r.key]! }));
}
