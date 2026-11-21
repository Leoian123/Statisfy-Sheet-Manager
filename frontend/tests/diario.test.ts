import { test } from "node:test";
import assert from "node:assert/strict";
import type { JournalEntry } from "../src/api/journal.ts";
import {
  addTags, filterCandidates, groupBySession, isLong, mergePage, normTag, prefillFromQuery, pruneForChar, samePicks, togglePick, type Picked,
} from "../src/lib/diario.ts";

const e = (id: number, session: number, pinned = false) => ({ id, session, pinned } as unknown as JournalEntry);
const p = (kind: Picked["kind"], ref: string): Picked => ({ kind, ref, label: ref, detail: "", rarity: null });

test("tag normalizzati come il server: minuscolo, spazi compressi, 24 caratteri, niente doppioni, max 8", () => {
  assert.equal(normTag("  Boss   FINALE \u0007"), "boss finale");
  assert.equal(normTag("x".repeat(30)).length, 24);
  assert.deepEqual(addTags(["boss"], "Boss, drago ,, Indizi"), ["boss", "drago", "indizi"]);
  assert.equal(addTags([], Array.from({ length: 12 }, (_, i) => `t${i}`).join(",")).length, 8);
});

test("timeline: fissate in cima, poi sessioni dalla più recente", () => {
  const g = groupBySession([e(1, 3, true), e(2, 5), e(3, 3), e(4, 5), e(5, 4)]);
  assert.deepEqual(g.map((x) => x.title), ["Fissate", "Sessione 5", "Sessione 4", "Sessione 3"]);
  assert.deepEqual(g.map((x) => x.items.map((i) => i.id)), [[1], [2, 4], [5], [3]]);
  assert.deepEqual(groupBySession([]), []);
});

test("Mostra altre non duplica le pagine già caricate", () => {
  assert.deepEqual(mergePage([e(1, 1), e(2, 1)], [e(2, 1), e(3, 1)]).map((x) => x.id), [1, 2, 3]);
});

test("testo lungo per caratteri o per righe", () => {
  assert.equal(isLong("breve"), false);
  assert.equal(isLong("a".repeat(400)), true);
  assert.equal(isLong("a\nb\nc\nd\ne\nf\ng"), true);
});

test("ricerca dei candidati senza accenti, su etichetta e dettagli", () => {
  const list = [{ ref: "1", label: "Spada dell'Alba", detail: "Arma" }, { ref: "2", label: "Pozione", detail: "Consumabile · città" }];
  assert.deepEqual(filterCandidates(list, "CITTA").map((x) => x.ref), ["2"]);
  assert.deepEqual(filterCandidates(list, "  ").map((x) => x.ref), ["1", "2"]);
});

test("cambiando PG restano solo tiri e quest", () => {
  const all = [p("roll", "7"), p("item", "Spada"), p("quest", "Il ponte"), p("skill", "Fendente")];
  assert.equal(pruneForChar(all, 1, 1), all);
  assert.deepEqual(pruneForChar(all, 2, 1).map((x) => x.kind), ["roll", "quest"]);
  assert.deepEqual(pruneForChar(all, null, 1).map((x) => x.kind), ["roll", "quest"]);
});

test("toggle degli allegati con il limite di 12 (stesso nome senza distinzione di maiuscole)", () => {
  let cur: Picked[] = [];
  for (let i = 0; i < 12; i++) cur = togglePick(cur, p("item", `x${i}`)) ?? cur;
  assert.equal(cur.length, 12);
  assert.equal(togglePick(cur, p("item", "oltre")), null);
  assert.equal(togglePick(cur, p("item", "X3"))?.length, 11);
});

test("prefill da URL: solo interi positivi", () => {
  assert.deepEqual(prefillFromQuery(new URLSearchParams("char=4&roll=99")), { charId: 4, rollId: "99" });
  assert.deepEqual(prefillFromQuery(new URLSearchParams("char=-1&roll=1e3")), { charId: null, rollId: null });
  assert.deepEqual(prefillFromQuery(new URLSearchParams("roll=0")), { charId: null, rollId: null });
});

test("samePicks confronta tipo e riferimento nell'ordine", () => {
  assert.equal(samePicks([p("roll", "1"), p("item", "Spada")], [p("roll", "1"), p("item", "spada")]), true);
  assert.equal(samePicks([p("roll", "1")], [p("roll", "2")]), false);
  assert.equal(samePicks([p("roll", "1"), p("item", "a")], [p("item", "a"), p("roll", "1")]), false);
});
