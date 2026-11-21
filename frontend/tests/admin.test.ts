import { test } from "node:test";
import assert from "node:assert/strict";
import type { AdminUser } from "../src/api/admin.ts";
import { blockReason, counts, lastSeen, matches, otherActiveMasters, passwordError, userState, usernameError } from "../src/lib/admin.ts";

const NOW = Date.parse("2026-11-21T12:00:00+00:00");

function u(p: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 2, username: "giocatore1", display_name: "G1", role: "player", active: true, must_change_password: false,
    created_at: "", last_login_at: "", is_self: false, characters: [], ...p,
  };
}

test("nome utente come il server", () => {
  assert.equal(usernameError("luca"), null);
  assert.equal(usernameError("  kelvin.player-2_ "), null);
  for (const bad of ["ab", "con spazi", "x".repeat(31), "<b>", "nuovo‮1", ""]) assert.ok(usernameError(bad), bad);
  const users = [u({ id: 2, username: "Luca" })];
  assert.match(usernameError("LUCA", users) ?? "", /Luca/);
  assert.equal(usernameError("luca", users, 2), null); // rinominare se stesso con altre maiuscole
});

test("password come il server", () => {
  assert.equal(passwordError("una-bella-frase", "luca"), null);
  assert.ok(passwordError("corta"));
  assert.ok(passwordError("        "));
  assert.ok(passwordError("LucaLuca", "lucaluca"));
  assert.ok(passwordError("é".repeat(40))); // 80 byte
  assert.equal(passwordError("é".repeat(36)), null); // 72 byte
});

test("ultimo Master protetto", () => {
  const me = u({ id: 1, role: "master", is_self: true });
  const vice = u({ id: 3, role: "master" });
  const g = u();
  assert.equal(otherActiveMasters([me, vice, g], 3), 1);
  assert.ok(blockReason([me, vice, g], me, "demote")); // se stesso
  assert.equal(blockReason([me, vice, g], vice, "demote"), null);
  assert.ok(blockReason([u({ id: 1, role: "master", active: false }), vice, g], vice, "deactivate"));
  assert.equal(blockReason([me, vice, g], g, "deactivate"), null);
  assert.ok(blockReason([me, g], me, "reset"));
  assert.ok(blockReason([me, u({ characters: [{ id: 1, name: "K", classe: "x", level: 1 }] })], u({ characters: [{ id: 1, name: "K", classe: "x", level: 1 }] }), "delete"));
});

test("stato, conteggi e ricerca", () => {
  assert.equal(userState(u({ active: false })).label, "Disattivato");
  assert.equal(userState(u({ must_change_password: true })).label, "Mai entrato");
  assert.equal(userState(u({ must_change_password: true, last_login_at: "2026-11-20T10:00:00+00:00" })).label, "Password provvisoria");
  assert.equal(userState(u()).tone, "good");
  const list = [u({ role: "master" }), u(), u({ active: false }), u({ must_change_password: true })];
  assert.deepEqual(counts(list), { master: 1, player: 2, inactive: 1, pending: 1 });
  const k = u({ characters: [{ id: 1, name: "Kelvin", classe: "Domatore", level: 77 }] });
  assert.ok(matches(k, "kel") && matches(k, "GIOC") && matches(k, "") && !matches(k, "dante"));
});

test("ultimo accesso compatto", () => {
  assert.equal(lastSeen("", NOW), "mai");
  assert.equal(lastSeen("nonsense", NOW), "mai");
  assert.equal(lastSeen("2026-11-21T11:59:30+00:00", NOW), "adesso");
  assert.equal(lastSeen("2026-11-21T11:30:00+00:00", NOW), "30 min fa");
  assert.equal(lastSeen("2026-11-21T07:00:00+00:00", NOW), "5 h fa");
  assert.equal(lastSeen("2026-11-20T10:00:00+00:00", NOW), "ieri");
  assert.equal(lastSeen("2026-11-11T12:00:00+00:00", NOW), "10 g fa");
  assert.equal(lastSeen("2026-12-21T12:00:00+00:00", NOW), "adesso"); // orologi sfasati: mai negativo
});
