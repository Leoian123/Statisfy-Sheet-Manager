// API dell'amministrazione (/api/admin, solo Master): account, ruoli, password provvisorie, assegnazione dei PG.
import { request } from "./client";
import type { Role } from "./types";

export interface AdminChar { id: number; name: string; classe: string; level: number }
export interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  /** ISO, "" se l'account è precedente all'amministrazione */
  created_at: string;
  /** ISO, "" se non è mai entrato */
  last_login_at: string;
  is_self: boolean;
  characters: AdminChar[];
}
export interface NewUser { username: string; display_name?: string; role: Role; password?: string }
export interface UserPatch { username?: string; display_name?: string; role?: Role; active?: boolean }
/** La password provvisoria arriva una sola volta: il server conserva solo l'hash. */
export interface WithTemp { user: AdminUser; temporary_password?: string }
export interface AdminLogEntry { id: number; at: string; actor: string; action: string; target: string; detail: string }
export interface Assigned { id: number; name: string; owner_id: number; owner_name: string }

const enc = encodeURIComponent;

export const adminApi = {
  users: () => request<AdminUser[]>("GET", "/admin/users"),
  create: (u: NewUser) => request<WithTemp>("POST", "/admin/users", u),
  patch: (id: number, p: UserPatch) => request<AdminUser>("PATCH", `/admin/users/${enc(id)}`, p),
  resetPassword: (id: number) => request<WithTemp>("POST", `/admin/users/${enc(id)}/reset-password`),
  logoutAll: (id: number) => request<void>("POST", `/admin/users/${enc(id)}/logout-all`),
  remove: (id: number) => request<void>("DELETE", `/admin/users/${enc(id)}`),
  assign: (charId: number, ownerId: number) =>
    request<Assigned>("PATCH", `/admin/characters/${enc(charId)}/owner`, { owner_id: ownerId }),
  log: (limit = 50) => request<AdminLogEntry[]>("GET", `/admin/log?limit=${enc(limit)}`),
};
