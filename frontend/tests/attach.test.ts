import { test } from "node:test";
import assert from "node:assert/strict";
import { attachables, clampMod, filterGroups, fromRoll } from "../src/lib/attach.ts";

type Char = Parameters<typeof attachables>[0];

const dante = {
  derived: [{ key: "bonusFortuna", value: 13.33 }],
  totals: { LCK: 1333 },
  skills: [{ name: "Lettura delle carte", lvl: 4, type: "Passiva", passive: "Vede i bari" }],
  active_skills: [{ name: "Rilancio", lvl: 2, cost: "20 MP", effect: "Ritira un dado" }],
  titles: [{ name: "Baro", rarity: "Raro", bonus: { DEX: 10, LCK: -5 } }],
  talents: [{ name: "Re dei Giochi", rarity: "Epico", origin: "Evolutivo", effect: "Fortuna +25" }],
} as unknown as Char;

test("valori suggeriti: +2 per Grado, titoli 0, Re dei Giochi = bonus Fortuna", () => {
  const g = attachables(dante);
  assert.deepEqual(g.map((x) => x.label), ["Skill", "Skill attive", "Titoli", "Talenti"]);
  assert.equal(g[0].items[0].mod, 8);
  assert.equal(g[1].items[0].mod, 4);
  assert.equal(g[2].items[0].mod, 0);
  assert.equal(g[2].items[0].text, "DEX +10, LCK -5");
  const re = g[3].items[0];
  assert.equal(re.mod, 13);
  assert.match(re.text, /LCK 1333\/100/);
});

test("senza Re dei Giochi il bonus Fortuna è una voce a parte; senza bonusFortuna niente voce", () => {
  const c = { ...dante, talents: [] } as unknown as Char;
  const g = attachables(c);
  assert.equal(g.at(-1)!.label, "Statistiche");
  assert.equal(g.at(-1)!.items[0].kind, "Fortuna");
  const none = attachables({ ...dante, talents: [], derived: [] } as unknown as Char);
  assert.ok(!none.some((x) => x.label === "Statistiche"));
});

test("PG vuoto: nessun gruppo", () => {
  assert.deepEqual(attachables({ derived: [], skills: [], active_skills: [], titles: [], talents: [] } as unknown as Char), []);
});

test("clampMod", () => {
  assert.equal(clampMod(5.9), 5);
  assert.equal(clampMod(-5.9), -5);
  assert.equal(clampMod(5000), 999);
  assert.equal(clampMod(-5000), -999);
  assert.equal(clampMod(Number.NaN), 0);
  assert.equal(clampMod(Number("abc")), 0);
});

test("filterGroups cerca in nome, sottotitolo ed effetto e toglie i gruppi vuoti", () => {
  const g = attachables(dante);
  assert.equal(filterGroups(g, "  "), g);
  assert.deepEqual(filterGroups(g, "RITIRA").map((x) => x.label), ["Skill attive"]);
  assert.deepEqual(filterGroups(g, "raro").flatMap((x) => x.items.map((i) => i.name)), ["Baro"]);
  assert.deepEqual(filterGroups(g, "nessuno"), []);
});

test("fromRoll rifà gli allegati con i valori usati e segnala quelli spariti", () => {
  const g = attachables(dante);
  const x = fromRoll({ reason: "Bluff al tavolo", call: "sotto", mods: [
    { kind: "Talento", name: "Re dei Giochi", mod: 20, text: "" },
    { kind: "Skill", name: "Lettura delle carte", mod: 5000, text: "" },
    { kind: "Titolo", name: "Titolo evoluto e sparito", mod: 3, text: "" },
    // stesso nome ma tipo diverso: non deve agganciare la skill
    { kind: "Skill attiva", name: "Lettura delle carte", mod: 1, text: "" },
  ] }, g);
  assert.equal(x.reason, "Bluff al tavolo");
  assert.equal(x.call, "sotto");
  assert.deepEqual(Object.keys(x.attached).sort(), ["sk:Lettura delle carte", "ta:Re dei Giochi"]);
  assert.equal(x.attached["ta:Re dei Giochi"].mod, 20);
  assert.equal(x.attached["sk:Lettura delle carte"].mod, 999);
  assert.deepEqual(x.missing, ["Titolo evoluto e sparito", "Lettura delle carte"]);
});

test("fromRoll di un tiro del Master senza dichiarazione né allegati", () => {
  const x = fromRoll({ reason: "", call: null, mods: [] }, attachables(dante));
  assert.deepEqual(x, { attached: {}, reason: "", call: null, missing: [] });
});
