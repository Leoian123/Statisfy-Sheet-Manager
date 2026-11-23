import { test } from "node:test";
import assert from "node:assert/strict";
import type { Ticket } from "../src/api/tickets.ts";
import {
  activeTotal, ageText, bucketOf, countBuckets, archiveText, canEdit, canWithdraw, isClosed, masterMoves, masterUnread, newTicketError, pruneSeen, sortTickets,
} from "../src/lib/richieste.ts";

const NOW = Date.parse("2026-11-21T12:00:00+00:00");

function tk(p: Partial<Ticket> = {}): Ticket {
  return {
    id: 1, author_id: 2, author_name: "G1", mine: true, char_id: null, char_name: null, kind: "funzione", title: "Titolo",
    body: "Testo", status: "aperta", answer: "", messages: [], issue_id: null, unread: false,
    created_at: "2026-11-20T10:00:00+00:00", updated_at: "2026-11-20T10:00:00+00:00", closed_at: null, archived_at: null,
    archive_at: null, version: 1, ...p,
  };
}

test("età compatta", () => {
  assert.equal(ageText("2026-11-21T11:59:40+00:00", NOW), "adesso");
  assert.equal(ageText("2026-11-21T11:55:00+00:00", NOW), "5 min fa");
  assert.equal(ageText("2026-11-21T09:00:00+00:00", NOW), "3 h fa");
  assert.equal(ageText("2026-11-20T09:00:00+00:00", NOW), "ieri");
  assert.equal(ageText("2026-11-17T12:00:00+00:00", NOW), "4 g fa");
  assert.match(ageText("2026-10-01T12:00:00+00:00", NOW), /1 ott/);
  assert.equal(ageText("non è una data", NOW), "—");
  // orologio del client indietro rispetto al server: niente età negative
  assert.equal(ageText("2026-11-21T12:05:00+00:00", NOW), "adesso");
});

test("testo dell'archiviazione", () => {
  assert.equal(archiveText(null, NOW), null);
  assert.match(archiveText("2026-11-26T12:00:00+00:00", NOW) ?? "", /^va in archivio il 26 nov \(tra 5 giorni\)$/);
  assert.match(archiveText("2026-11-22T08:00:00+00:00", NOW) ?? "", /\(domani\)$/);
  assert.equal(archiveText("2026-11-21T11:00:00+00:00", NOW), "va in archivio al prossimo aggiornamento");
});

test("modifica e ritiro solo dell'autore e negli stati giusti", () => {
  assert.equal(canEdit(tk()), true);
  assert.equal(canEdit(tk({ status: "in_esame" })), false);
  assert.equal(canEdit(tk({ mine: false })), false);
  assert.equal(canEdit(tk({ archived_at: "2026-11-21T00:00:00+00:00" })), false);
  assert.equal(canWithdraw(tk({ status: "in_esame" })), true);
  assert.equal(canWithdraw(tk({ status: "risolta" })), false);
  assert.equal(canWithdraw(tk({ mine: false })), false);
  assert.equal(isClosed("ritirata"), true);
  assert.equal(isClosed("in_esame"), false);
});

test("mosse del Master: chiudere richiede la risposta, Riapri solo per risolte e respinte", () => {
  assert.deepEqual(masterMoves("aperta").map((m) => m.to), ["in_esame", "risolta", "respinta"]);
  assert.deepEqual(masterMoves("in_esame").map((m) => m.to), ["risolta", "respinta"]);
  assert.ok(masterMoves("in_esame").every((m) => m.needsAnswer));
  assert.deepEqual(masterMoves("risolta").map((m) => m.label), ["Riapri"]);
  assert.deepEqual(masterMoves("ritirata"), []);
});

test("da leggere per il Master: nuova o ultimo messaggio del giocatore, finché non la vede", () => {
  const msg = (role: "master" | "giocatore") => ({ by: 1, by_name: "x", role, text: "t", at: "2026-11-20T10:00:00+00:00" });
  assert.equal(masterUnread(tk(), undefined), true);
  assert.equal(masterUnread(tk(), "2026-11-20T10:00:00+00:00"), false);
  assert.equal(masterUnread(tk({ updated_at: "2026-11-20T11:00:00+00:00" }), "2026-11-20T10:00:00+00:00"), true);
  assert.equal(masterUnread(tk({ status: "in_esame", messages: [msg("master")] }), undefined), false);
  assert.equal(masterUnread(tk({ status: "in_esame", messages: [msg("master"), msg("giocatore")] }), undefined), true);
  assert.equal(masterUnread(tk({ status: "risolta", messages: [msg("giocatore")] }), undefined), false);
  assert.equal(masterUnread(tk({ archived_at: "2026-11-21T00:00:00+00:00" }), undefined), false);
});

test("ordine: prima le da leggere, poi dalla più recente", () => {
  const a = tk({ id: 1, updated_at: "2026-11-20T10:00:00+00:00" });
  const b = tk({ id: 2, updated_at: "2026-11-21T10:00:00+00:00" });
  const c = tk({ id: 3, updated_at: "2026-11-19T10:00:00+00:00", unread: true });
  assert.deepEqual(sortTickets([a, b, c], "giocatore").map((t) => t.id), [3, 2, 1]);
  const items = [a, b, c];
  sortTickets(items, "giocatore");
  assert.deepEqual(items.map((t) => t.id), [1, 2, 3], "non muta l'array");
  // Master: b già vista, a nuova
  const seen = { "2": "2026-11-21T10:00:00+00:00", "3": "2026-11-19T10:00:00+00:00" };
  assert.deepEqual(sortTickets([a, b, c], "master", seen).map((t) => t.id), [1, 2, 3]);
});

test("totale attive e validazione della nuova richiesta", () => {
  assert.equal(activeTotal({ aperta: 1, in_esame: 2, risolta: 3, respinta: 4, ritirata: 5, archivio: 100 }), 15);
  const lim = { title: 10, body: 20 };
  assert.match(newTicketError("  a   ", "x", lim) ?? "", /almeno 3/);
  assert.match(newTicketError("abcdefghijk", "x", lim) ?? "", /troppo lungo/);
  assert.match(newTicketError("abc", "   ", lim) ?? "", /testo/);
  assert.match(newTicketError("abc", "x".repeat(21), lim) ?? "", /Testo troppo lungo/);
  assert.equal(newTicketError("a b c", "ok", lim), null);
});

test("mappa delle viste del Master ripulita e limitata", () => {
  assert.deepEqual(pruneSeen(null), {});
  assert.deepEqual(pruneSeen([1, 2]), {});
  assert.deepEqual(pruneSeen({ "1": "a", x: "b", "2": 3, "3": "c" }), { "1": "a", "3": "c" });
  assert.deepEqual(Object.keys(pruneSeen({ "1": "a", "5": "b", "9": "c" }, 2)).sort(), ["5", "9"]);
});


const msg = (role: "master" | "player") => ({ by: 1, by_name: "x", role, text: "t", at: "2026-11-20T11:00:00+00:00" });

test("coda del Master: da fare, in attesa, chiuse", () => {
  assert.equal(bucketOf(tk(), "master"), "todo");
  assert.equal(bucketOf(tk({ messages: [msg("master")] }), "master"), "waiting");
  assert.equal(bucketOf(tk({ messages: [msg("master"), msg("player")] }), "master"), "todo");
  assert.equal(bucketOf(tk({ kind: "comunicazione", messages: [msg("player")] }), "master"), "waiting");
  assert.equal(bucketOf(tk({ kind: "evoluzione" }), "master"), "todo");
  assert.equal(bucketOf(tk({ status: "risolta" }), "master"), "closed");
  assert.deepEqual(countBuckets([tk(), tk({ status: "respinta" }), tk({ messages: [msg("master")] })], "master"), { todo: 1, waiting: 1, closed: 1 });
});

test("coda del giocatore: il Master ti ha scritto = da fare", () => {
  assert.equal(bucketOf(tk(), "giocatore"), "waiting");
  assert.equal(bucketOf(tk({ messages: [msg("master")] }), "giocatore"), "todo");
  assert.equal(bucketOf(tk({ mine: false, to_me: true, kind: "comunicazione" }), "giocatore"), "todo");
  assert.equal(bucketOf(tk({ mine: false, to_me: true, kind: "comunicazione", messages: [msg("player")] }), "giocatore"), "waiting");
});
