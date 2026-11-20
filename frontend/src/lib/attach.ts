/* Allegati al tiro d100 della Plancia di gioco: cosa si può allegare (con i valori suggeriti) e come rifare
   gli allegati di un tiro già fatto ("Ripeti ultimo"). Solo funzioni pure: testate in tests/attach.test.ts. */
import type { Character, Roll, RollCall, RollModKind } from "../api/types";
import { ROMAN } from "./format.ts";

export interface AttachItem { key: string; kind: RollModKind; name: string; sub: string; rarity?: string; mod: number; text: string; raw?: string }
export interface AttachGroup { label: string; items: AttachItem[] }
export type Attached = Record<string, AttachItem>;

const nf = (x: number) => (Math.round(x * 100) / 100).toLocaleString("it-IT");
const roman = (n: unknown) => ROMAN[Math.max(1, Math.min(10, Number(n) || 1))];
const statText = (b: Record<string, number> | undefined) => Object.entries(b || {}).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(", ");

/** Modificatore valido per il server: intero tra −999 e 999 (testo o NaN → 0). */
export const clampMod = (v: number) => Math.max(-999, Math.min(999, Math.trunc(Number(v) || 0)));

/** Cosa si può allegare, con i valori suggeriti: skill e skill attive +2 per Grado; titoli e talenti 0;
 *  Re dei Giochi = bonus Fortuna arrotondato; senza quel talento, una voce "Bonus Fortuna sui tiri". */
export function attachables(c: Pick<Character, "derived" | "skills" | "active_skills" | "titles" | "talents" | "totals">): AttachGroup[] {
  const luckD = c.derived.find((d) => d.key === "bonusFortuna");
  const luck = luckD ? Number(luckD.value) : null;
  const groups: AttachGroup[] = [];
  const sk: AttachItem[] = (c.skills || []).map((s) => ({ key: "sk:" + s.name, kind: "Skill", name: s.name, sub: `Grado ${roman(s.lvl)} · ${s.type || "—"}`,
    mod: 2 * (Number(s.lvl) || 0), text: s.passive || `Skill ${s.type || ""} di Grado ${roman(s.lvl)}` }));
  if (sk.length) groups.push({ label: "Skill", items: sk });
  const ak: AttachItem[] = (c.active_skills || []).map((s) => ({ key: "as:" + s.name, kind: "Skill attiva", name: s.name, sub: `Grado ${roman(s.lvl)} · ${s.cost || ""}`,
    mod: 2 * (Number(s.lvl) || 0), text: s.effect || "" }));
  if (ak.length) groups.push({ label: "Skill attive", items: ak });
  const ti: AttachItem[] = (c.titles || []).map((t) => ({ key: "ti:" + t.name, kind: "Titolo", name: t.name, sub: t.rarity, rarity: t.rarity,
    mod: 0, text: statText(t.bonus) || "Effetto narrativo" }));
  if (ti.length) groups.push({ label: "Titoli", items: ti });
  const lck = c.totals?.LCK;
  const ta: AttachItem[] = (c.talents || []).map((t) => {
    const isLuck = /re dei giochi/i.test(t.name) && luck != null;
    return { key: "ta:" + t.name, kind: "Talento", name: t.name, sub: t.rarity + (t.origin ? ` · ${t.origin}` : ""), rarity: t.rarity,
      mod: isLuck ? Math.round(luck!) : 0, text: (t.effect || "") + (isLuck ? ` · ora +${nf(luck!)} (LCK ${lck ?? "?"}/100)` : "") };
  });
  if (ta.length) groups.push({ label: "Talenti", items: ta });
  if (luck != null && !ta.some((x) => /re dei giochi/i.test(x.name))) {
    groups.push({ label: "Statistiche", items: [{ key: "der:fortuna", kind: "Fortuna", name: "Bonus Fortuna sui tiri", sub: "LCK / 100",
      mod: Math.round(luck), text: "Dalla Fortuna (LCK)" }] });
  }
  return groups;
}

/** Filtra i gruppi per testo (nome, sottotitolo, effetto), senza distinguere maiuscole; toglie i gruppi vuoti. */
export function filterGroups(groups: AttachGroup[], q: string): AttachGroup[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return groups;
  return groups.map((g) => ({ ...g, items: g.items.filter((it) => `${it.name} ${it.sub} ${it.text}`.toLowerCase().includes(ql)) }))
    .filter((g) => g.items.length);
}

/** Rifà la preparazione di un tiro già fatto: stessi allegati con lo stesso valore, stesso motivo e dichiarazione.
 *  Un allegato che non c'è più nella scheda (skill tolta, titolo evoluto) viene saltato e contato in `missing`. */
export function fromRoll(r: Pick<Roll, "mods" | "reason" | "call">, groups: AttachGroup[]): { attached: Attached; reason: string; call: RollCall | null; missing: string[] } {
  const all = groups.flatMap((g) => g.items);
  const attached: Attached = {};
  const missing: string[] = [];
  for (const m of r.mods || []) {
    const it = all.find((x) => x.kind === m.kind && x.name === m.name);
    if (it) attached[it.key] = { ...it, mod: clampMod(m.mod) };
    else missing.push(m.name);
  }
  return { attached, reason: r.reason || "", call: r.call ?? null, missing };
}
