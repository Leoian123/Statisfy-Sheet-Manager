import { test } from "node:test";
import assert from "node:assert/strict";
import type { Immagine } from "../src/api/png.ts";
import {
  affinitaLabel, aggiungiImmagine, bozzaNuova, iniziali, misureRidotte, nomeStrato, nuovoSeme, principale, ritrattoPrincipale,
  RITRATTO_MAX, togliImmagine, tipoNota, tonoStrato,
} from "../src/lib/png.ts";

const img = (id: string, p = false): Immagine => ({ id, src: "data:image/jpeg;base64,AA==", principale: p });

test("misure ridotte mantengono le proporzioni", () => {
  assert.deepEqual(misureRidotte(2048, 1024), { w: 512, h: 256 });
  assert.deepEqual(misureRidotte(300, 600), { w: 256, h: 512 });
  assert.deepEqual(misureRidotte(200, 100), { w: 200, h: 100 });
  assert.deepEqual(misureRidotte(0, 100), { w: 0, h: 0 });
});

test("immagini: sempre una principale, al più sei", () => {
  let imm = aggiungiImmagine([], img("a"));
  assert.equal(imm[0].principale, true);
  imm = aggiungiImmagine(imm, img("b"));
  assert.deepEqual(imm.map((i) => i.principale), [true, false]);
  imm = principale(imm, "b");
  assert.equal(ritrattoPrincipale({ ritratto: { descrizione: "", immagini: imm } })?.id, "b");
  imm = togliImmagine(imm, "b");
  assert.deepEqual(imm.map((i) => [i.id, i.principale]), [["a", true]]);
  for (let k = 0; k < 10; k++) imm = aggiungiImmagine(imm, img(`x${k}`));
  assert.equal(imm.length, RITRATTO_MAX);
  assert.equal(imm.filter((i) => i.principale).length, 1);
});

test("strati e note", () => {
  assert.equal(tonoStrato("ritocco"), "gold");
  assert.equal(tonoStrato("ruolo fabbro (villaggio)"), "violet");
  assert.equal(tonoStrato("fabbro · variante nano"), "violet");
  assert.equal(tonoStrato("età bambino"), "good");
  assert.equal(nomeStrato("fabbro · variante nano"), "variante");
  assert.equal(nomeStrato("razza nano"), "razza");
  assert.equal(tipoNota("PROPOSTA: un gradino"), "proposta");
  assert.equal(tipoNota("FONTE Zona_Alba_Chiara"), "fonte");
  assert.equal(tipoNota(""), null);
});

test("bozza, seme, iniziali, affinità", () => {
  const b = bozzaNuova({ ruolo: "fabbro" }, 7);
  assert.equal(b.ruolo, "fabbro");
  assert.equal(b.seme, 7);
  assert.deepEqual(b.campi, {});
  assert.equal(nuovoSeme(() => 0), 1);
  assert.equal(iniziali("Mira Vacchetti"), "MV");
  assert.equal(iniziali("[nome da scegliere]"), "?");
  assert.equal(iniziali("Tek"), "T");
  assert.equal(affinitaLabel(-1), "indifferenza");
  assert.equal(affinitaLabel(3), "apprezzamento");
  assert.equal(affinitaLabel(-10), "odio mortale");
});
