// Client HTTP: token da localStorage, 401 -> logout, errori `detail` leggibili.
import type {
  Campaign, Character, CharacterSummary, CombatActionType, CreateCharacterRequest, Issue, LoginResponse,
  CharRollRequest, NewEffect, Npc, PreviewRequest, PreviewResponse, Roll, RollCall, RollRequest, RollRequestStatus, RulesConfig, SlotKey, User,
} from "./types";

export const TOKEN_KEY = "statisfy-token";
const USE_MOCK = import.meta.env.VITE_MOCK === "1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage non disponibile */ }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

function detailMessage(status: number, body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string" && d.trim()) return d;
    if (Array.isArray(d)) {
      // Fallback se arriva la lista Pydantic grezza
      const msgs = d.map((x) => (x && typeof x === "object" && "msg" in x ? String((x as { msg: unknown }).msg) : "")).filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
  }
  if (status === 0) return "Server non raggiungibile. Controlla che il backend sia avviato.";
  if (status === 401) return "Sessione scaduta: accedi di nuovo.";
  if (status === 403) return "Non hai i permessi per questa operazione.";
  if (status === 404) return "Elemento non trovato.";
  if (status >= 500) return "Errore del server. Riprova tra poco.";
  return `Richiesta non riuscita (errore ${status}).`;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let status: number;
  let data: unknown = null;

  if (USE_MOCK) {
    const mock = await import("./mock");
    const res = await mock.handle(method, path, body, token);
    status = res.status;
    data = res.data;
  } else {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, detailMessage(0, null));
    }
    status = res.status;
    if (status !== 204) {
      const text = await res.text();
      if (text) {
        try { data = JSON.parse(text); } catch { data = null; }
      }
    }
  }

  if (status === 401 && path !== "/auth/login") {
    setToken(null);
    onUnauthorized?.();
  }
  if (status < 200 || status >= 300) throw new ApiError(status, detailMessage(status, data));
  return data as T;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Errore imprevisto.";
}

const enc = encodeURIComponent;

export const api = {
  login: (username: string, password: string) => request<LoginResponse>("POST", "/auth/login", { username, password }),
  me: () => request<User>("GET", "/auth/me"),

  rules: () => request<RulesConfig>("GET", "/rules"),
  preview: (req: PreviewRequest) => request<PreviewResponse>("POST", "/rules/preview", req),

  characters: () => request<CharacterSummary[]>("GET", "/characters"),
  character: (id: number) => request<Character>("GET", `/characters/${enc(id)}`),
  createCharacter: (req: CreateCharacterRequest) => request<Character>("POST", "/characters", req),
  patchCharacter: (id: number, patch: Record<string, unknown>) => request<Character>("PATCH", `/characters/${enc(id)}`, patch),
  levelUp: (id: number) => request<Character>("POST", `/characters/${enc(id)}/level-up`),
  distribute: (id: number, alloc: Record<string, number>) => request<Character>("POST", `/characters/${enc(id)}/distribute`, { alloc }),

  equip: (id: number, itemId: string, slot?: SlotKey) =>
    request<Character>("POST", `/characters/${enc(id)}/equipment/equip`, slot ? { item_id: itemId, slot } : { item_id: itemId }),
  unequip: (id: number, slot: SlotKey) => request<Character>("POST", `/characters/${enc(id)}/equipment/unequip`, { slot }),
  moveSlot: (id: number, fromSlot: SlotKey, toSlot: SlotKey) =>
    request<Character>("POST", `/characters/${enc(id)}/equipment/move`, { from_slot: fromSlot, to_slot: toSlot }),

  combatAction: (id: number, type: CombatActionType, amount: number) =>
    request<Character>("POST", `/characters/${enc(id)}/combat/action`, { type, amount }),
  endTurn: (id: number) => request<Character>("POST", `/characters/${enc(id)}/combat/end-turn`),
  addEffect: (id: number, eff: NewEffect) => request<Character>("POST", `/characters/${enc(id)}/combat/effects`, eff),
  removeEffect: (id: number, index: number) => request<Character>("DELETE", `/characters/${enc(id)}/combat/effects/${enc(index)}`),
  resetCombat: (id: number) => request<Character>("POST", `/characters/${enc(id)}/combat/reset`),
  death: (id: number, hubris: boolean, respawn: "checkpoint" | "here") =>
    request<Character>("POST", `/characters/${enc(id)}/death`, { hubris, respawn }),

  campaign: () => request<Campaign>("GET", "/campaign"),
  newSession: () => request<Campaign>("POST", "/campaign/session"),
  npcs: () => request<Npc[]>("GET", "/npcs"),
  patchNpc: (id: number, patch: Partial<Npc>) => request<Npc>("PATCH", `/npcs/${enc(id)}`, patch),
  addInteraction: (id: number, text: string) => request<Npc>("POST", `/npcs/${enc(id)}/interactions`, { text }),
  issues: () => request<Issue[]>("GET", "/issues"),
  patchIssue: (id: number, patch: { resolved?: boolean; decision?: string | null }) => request<Issue>("PATCH", `/issues/${enc(id)}`, patch),

  // Tavolo: il d100 lo tira il server
  rollForChar: (id: number, req: CharRollRequest) => request<Roll>("POST", `/table/characters/${enc(id)}/rolls`, req),
  masterRoll: (reason: string, secret: boolean, call: RollCall | null = null) =>
    request<Roll>("POST", "/table/rolls", { reason, secret, ...(call ? { call } : {}) }),
  rolls: (opts: { charId?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.charId != null) q.set("char_id", String(opts.charId));
    if (opts.limit != null) q.set("limit", String(opts.limit));
    const qs = q.toString();
    return request<Roll[]>("GET", `/table/rolls${qs ? `?${qs}` : ""}`);
  },
  rollRequests: (status?: RollRequestStatus) => request<RollRequest[]>("GET", `/table/requests${status ? `?status=${enc(status)}` : ""}`),
  createRollRequest: (charId: number, what: string, note: string) =>
    request<RollRequest>("POST", "/table/requests", { char_id: charId, what, note }),
  cancelRollRequest: (id: number) => request<void>("DELETE", `/table/requests/${enc(id)}`),
};
