import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMON_ASKS, quickAsks } from "../src/lib/asks.ts";

test("senza richieste: le comuni", () => {
  assert.deepEqual(quickAsks([]), COMMON_ASKS.slice(0, 6));
});

test("le recenti prima, dalla più nuova, senza doppioni né maiuscole diverse", () => {
  const out = quickAsks([
    { id: 1, what: "Scassinare" },
    { id: 3, what: "  percezione " },
    { id: 2, what: "Scassinare" },
    { id: 4, what: "" },
  ]);
  assert.deepEqual(out, ["percezione", "Scassinare", "Iniziativa", "Furtività", "Agilità", "Resistenza"]);
});

test("massimo rispettato", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: i, what: `Prova ${i}` }));
  assert.equal(quickAsks(many).length, 6);
  assert.deepEqual(quickAsks(many, 2), ["Prova 19", "Prova 18"]);
});
