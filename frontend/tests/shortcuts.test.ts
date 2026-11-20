import { test } from "node:test";
import assert from "node:assert/strict";
import { boardShortcut } from "../src/lib/shortcuts.ts";

const body = { tagName: "BODY" };

test("tasti principali", () => {
  assert.equal(boardShortcut({ key: "+", target: body }), "sopra");
  assert.equal(boardShortcut({ key: "=", target: body }), "sopra");
  assert.equal(boardShortcut({ key: "-", target: body }), "sotto");
  assert.equal(boardShortcut({ key: "l", target: body }), "roll");
  assert.equal(boardShortcut({ key: "L", target: body }), "roll");
  assert.equal(boardShortcut({ key: "r", target: body }), "repeat");
  assert.equal(boardShortcut({ key: "x", target: body }), null);
  assert.equal(boardShortcut({ key: "Enter", target: body }), null);
  assert.equal(boardShortcut({ key: "l" }), "roll");
});

test("niente scorciatoie mentre si scrive", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
    assert.equal(boardShortcut({ key: "l", target: { tagName } }), null, tagName);
  }
  assert.equal(boardShortcut({ key: "l", target: { tagName: "INPUT", type: "number" } }), null);
  assert.equal(boardShortcut({ key: "l", target: { tagName: "INPUT", type: "search" } }), null);
  assert.equal(boardShortcut({ key: "l", target: { tagName: "DIV", isContentEditable: true } }), null);
});

test("pulsanti e caselle non bloccano le scorciatoie", () => {
  assert.equal(boardShortcut({ key: "l", target: { tagName: "BUTTON" } }), "roll");
  assert.equal(boardShortcut({ key: "+", target: { tagName: "INPUT", type: "checkbox" } }), "sopra");
});

test("modificatori, ripetizione e dialoghi", () => {
  assert.equal(boardShortcut({ key: "r", ctrlKey: true, target: body }), null, "Ctrl+R ricarica la pagina");
  assert.equal(boardShortcut({ key: "l", metaKey: true, target: body }), null);
  assert.equal(boardShortcut({ key: "l", altKey: true, target: body }), null);
  assert.equal(boardShortcut({ key: "l", repeat: true, target: body }), null, "tasto tenuto premuto: un solo tiro");
  assert.equal(boardShortcut({ key: "l", target: body }, true), null, "finestra di conferma aperta");
});
