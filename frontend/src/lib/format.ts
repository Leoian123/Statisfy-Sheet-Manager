// Solo formattazione di valori ricevuti dal server: nessuna regola di gioco qui.
import type { DerivedFmt, RulesConfig } from "../api/types";

export function n(v: number | null | undefined): string {
  return Math.round(Number(v) || 0).toLocaleString("it-IT");
}

function round1(x: number): string {
  return (Math.round(x * 10) / 10).toLocaleString("it-IT");
}

export function fmt(value: number, kind: DerivedFmt): string {
  const x = Number(value) || 0;
  switch (kind) {
    case "int": return Math.round(x).toLocaleString("it-IT");
    case "kg": return `${round1(x)} kg`;
    case "int1": return round1(x);
    case "pct": return `${round1(x)}%`;
    case "permin": return `${round1(x)}/min`;
    case "mult": return `×${(Math.round(x * 100) / 100).toLocaleString("it-IT")}`;
    case "dec": return (Math.round(x * 100) / 100).toLocaleString("it-IT");
    default: return String(value);
  }
}

/** Differenza formattata (es. "+12", "−0,5%") o stringa vuota se nulla. */
export function fmtDiff(diff: number, kind: DerivedFmt | "int"): string {
  if (Math.abs(diff) < 1e-9) return "";
  const digits = kind === "int" ? 0 : kind === "mult" ? 2 : 1;
  const v = Math.abs(diff).toLocaleString("it-IT", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  const unit = kind === "pct" ? "%" : kind === "kg" ? " kg" : "";
  return `${diff > 0 ? "+" : "−"}${v}${unit}`;
}

export const ROMAN = ["—", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function rarityKey(r: string | null | undefined): string {
  return String(r || "").toLowerCase().replace(/\s+/g, "").trim();
}

/** Rango di potere per un livello qualsiasi (lookup sulla tabella di configurazione del server). */
export function powerRankFor(rules: RulesConfig | null, level: number): string {
  if (!rules) return "";
  const r = [...rules.power_ranks].sort((a, b) => b.min - a.min).find((x) => level >= x.min);
  return r ? r.name : "";
}

export function plural(k: number, one: string, many: string): string {
  return k === 1 ? one : many;
}
