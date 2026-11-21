// Regole dell'amministrazione lato client: stesse del server (app/accounts.py), qui solo per avvisare prima di inviare.
import type { AdminUser } from "../api/admin.ts";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;

export function usernameError(name: string, users: Pick<AdminUser, "id" | "username">[] = [], selfId?: number): string | null {
  const n = name.trim();
  if (!USERNAME_RE.test(n)) return "Da 3 a 30 caratteri tra lettere, cifre, punto, trattino e trattino basso.";
  const clash = users.find((u) => u.id !== selfId && u.username.toLowerCase() === n.toLowerCase());
  return clash ? `Esiste già «${clash.username}» (anche con maiuscole diverse).` : null;
}

export function passwordError(pw: string, username = ""): string | null {
  if (pw.length < PASSWORD_MIN) return `Almeno ${PASSWORD_MIN} caratteri.`;
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX_BYTES) return `Al massimo ${PASSWORD_MAX_BYTES} byte (circa 70 caratteri).`;
  if (!pw.trim()) return "Non può essere fatta solo di spazi.";
  if (username && pw.trim().toLowerCase() === username.trim().toLowerCase()) return "Non può essere uguale al nome utente.";
  return null;
}

/** Master attivi diversi da `id`: se 0, quell'account non può perdere il ruolo né essere disattivato. */
export function otherActiveMasters(users: AdminUser[], id: number): number {
  return users.filter((u) => u.id !== id && u.role === "master" && u.active).length;
}

/** Perché un'azione non è permessa su un account (null = permessa). Il server fa comunque lo stesso controllo. */
export function blockReason(users: AdminUser[], u: AdminUser, action: "demote" | "deactivate" | "delete" | "reset"): string | null {
  if (u.is_self) {
    if (action === "reset") return "La tua password la cambi da «Il mio account».";
    return "Sul tuo account lo può fare solo un altro Master.";
  }
  if (action !== "reset" && u.role === "master" && u.active && otherActiveMasters(users, u.id) === 0) {
    return "Serve almeno un Master attivo.";
  }
  if (action === "delete" && u.characters.length) return "Ha dei personaggi: assegnali ad altri o disattiva l'account.";
  return null;
}

export type UserState = { label: string; tone: "good" | "warn" | "bad" | "muted" };
export function userState(u: AdminUser): UserState {
  if (!u.active) return { label: "Disattivato", tone: "bad" };
  if (u.must_change_password) return { label: u.last_login_at ? "Password provvisoria" : "Mai entrato", tone: "warn" };
  return { label: "Attivo", tone: "good" };
}

/** «adesso», «5 min fa», «3 h fa», «ieri», «4 g fa», poi la data; "" → «mai». */
export function lastSeen(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!iso || !Number.isFinite(t)) return "mai";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "adesso";
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} h fa`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "ieri";
  if (d < 30) return `${d} g fa`;
  return new Date(t).toLocaleDateString("it-IT");
}

export function counts(users: AdminUser[]) {
  return {
    master: users.filter((u) => u.role === "master" && u.active).length,
    player: users.filter((u) => u.role === "player" && u.active).length,
    inactive: users.filter((u) => !u.active).length,
    pending: users.filter((u) => u.active && u.must_change_password).length,
  };
}

/** Filtro dell'elenco: per nome visibile, nome utente o nome di un PG. */
export function matches(u: AdminUser, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return u.display_name.toLowerCase().includes(s) || u.username.toLowerCase().includes(s)
    || u.characters.some((c) => c.name.toLowerCase().includes(s));
}

export const ACTION_LABELS: Record<string, string> = {
  crea: "Creato", modifica: "Modificato", password: "Password", disconnetti: "Disconnesso", elimina: "Eliminato", assegna: "Assegnato PG",
};
