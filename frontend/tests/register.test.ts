import { test } from "node:test";
import assert from "node:assert/strict";
import type { Roll } from "../src/api/types.ts";
import { combatEntries, registerEntries, splitTurn } from "../src/lib/register.ts";

function roll(id: number, at: string): Roll {
  return { id, char_id: 1, char_name: "Kelvin", by: "giocatore", author_id: 2, author_name: "G1", reason: "", tens: 0, units: id % 10,
    natural: 50, mods: [], total: 50, call: "sopra", crit: null, created_at: at } as unknown as Roll;
}

test("log_at si allinea dalla fine: le righe vecchie senza ora restano senza ora", () => {
  const e = combatEntries({ log: ["T1 · vecchia", "T1 · nuova A", "T2 · nuova B"], log_at: ["2026-11-20T10:00:00Z", "2026-11-20T10:05:00Z"] });
  assert.equal(e.length, 3);
  assert.equal(e[0].kind === "combat" && e[0].iso, "");
  assert.equal(e[0].at, -Infinity);
  assert.equal(e[1].kind === "combat" && e[1].iso, "2026-11-20T10:00:00Z");
  assert.equal(e[2].kind === "combat" && e[2].iso, "2026-11-20T10:05:00Z");
});

test("log_at più lungo di log (log svuotato) non sposta le ore", () => {
  const e = combatEntries({ log: ["T1 · dopo il nuovo scontro"], log_at: ["2026-11-20T09:00:00Z", "2026-11-20T11:00:00Z"] });
  assert.equal(e[0].kind === "combat" && e[0].iso, "2026-11-20T11:00:00Z");
});

test("senza log né log_at", () => {
  assert.deepEqual(combatEntries({}), []);
});

test("Tutto mescola tiri e combattimento dal più recente; le righe senza ora vanno in fondo nell'ordine scritto", () => {
  const rolls = [roll(2, "2026-11-20T10:03:00Z"), roll(1, "2026-11-20T10:01:00Z")];
  const combat = { log: ["T1 · senza ora 1", "T1 · senza ora 2", "T1 · danno", "T2 · cura"],
    log_at: ["2026-11-20T10:02:00Z", "2026-11-20T10:04:00Z"] };
  const { sorted, counts } = registerEntries(rolls, combat, "tutto");
  const label = (x: (typeof sorted)[number]) => (x.kind === "roll" ? `r${x.r.id}` : x.text);
  assert.deepEqual(sorted.map(label), ["T2 · cura", "r2", "T1 · danno", "r1", "T1 · senza ora 2", "T1 · senza ora 1"]);
  assert.deepEqual(counts, { tutto: 6, tiri: 2, combattimento: 4 });
});

test("filtri Tiri e Combattimento", () => {
  const rolls = [roll(1, "2026-11-20T10:01:00Z")];
  const combat = { log: ["T1 · a"], log_at: ["2026-11-20T10:00:00Z"] };
  assert.deepEqual(registerEntries(rolls, combat, "tiri").sorted.map((x) => x.kind), ["roll"]);
  assert.deepEqual(registerEntries(rolls, combat, "combattimento").sorted.map((x) => x.kind), ["combat"]);
  // l'array dei tiri non viene riordinato sul posto
  const rs = [roll(1, "2026-11-20T10:00:00Z"), roll(2, "2026-11-20T10:05:00Z")];
  registerEntries(rs, {}, "tiri");
  assert.deepEqual(rs.map((r) => r.id), [1, 2]);
});

test("splitTurn", () => {
  assert.deepEqual(splitTurn("T12 · Danno: −50 HP. HP 100."), { turn: 12, text: "Danno: −50 HP. HP 100." });
  assert.deepEqual(splitTurn("riga libera"), { turn: null, text: "riga libera" });
  assert.deepEqual(splitTurn("T3 · due\nrighe"), { turn: 3, text: "due\nrighe" });
});
